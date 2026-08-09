import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { AllExceptionsFilter } from './all-exceptions.filter';

function hostWith(requestId = 'test-request-id') {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ id: requestId }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  it('passes an HttpException through with its own status and body', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = hostWith();

    filter.catch(new NotFoundException('Clash tidak ditemukan.'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Clash tidak ditemukan.' }));
  });

  it('maps a Prisma unique-constraint violation (P2002) to 409', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = hostWith();
    const error = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '6.1.0',
    });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Data sudah ada (duplikat).' }));
  });

  it('maps MulterError LIMIT_FILE_SIZE to 413, not the generic 500 fallback', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = hostWith();

    filter.catch(new MulterError('LIMIT_FILE_SIZE'), host);

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 413, message: 'Ukuran file melebihi batas maksimum.' }),
    );
  });

  it('maps other MulterError codes to 400', () => {
    const filter = new AllExceptionsFilter();
    const { host, status } = hostWith();

    filter.catch(new MulterError('LIMIT_UNEXPECTED_FILE', 'files'), host);

    expect(status).toHaveBeenCalledWith(400);
  });

  it('maps a body-parser payload-too-large error to 413, not the generic 500 fallback', () => {
    // Mirrors what raw-body actually throws when main.ts's json body-parser
    // limit is exceeded: a plain Error with an http-errors `type` marker,
    // not an HttpException and not a MulterError.
    const filter = new AllExceptionsFilter();
    const { host, status, json } = hostWith();
    const error = Object.assign(new Error('request entity too large'), { type: 'entity.too.large' });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 413, message: 'Ukuran permintaan terlalu besar.' }),
    );
  });

  it('falls back to a generic 500 for a genuinely unexpected error', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = hostWith();

    filter.catch(new Error('kaboom'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'Terjadi kesalahan pada server.' }),
    );
  });

  // The request id (set by app.module.ts's genReqId, echoed on the
  // X-Request-Id response header) is the only way to tie a user-reported
  // "I got an error" back to the matching server-side log line — but only
  // worth attaching for our own faults (5xx), not routine 4xx client errors.
  it('attaches the request id to a 500 body but not to a 404', () => {
    const filter = new AllExceptionsFilter();
    const { host: host500, json: json500 } = hostWith('req-abc-123');
    filter.catch(new Error('kaboom'), host500);
    expect(json500).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'req-abc-123' }));

    const { host: host404, json: json404 } = hostWith('req-should-not-appear');
    filter.catch(new NotFoundException('Clash tidak ditemukan.'), host404);
    expect(json404).toHaveBeenCalledWith(expect.not.objectContaining({ requestId: expect.anything() }));
  });

  it('does not choke on a thrown non-Error value', () => {
    const filter = new AllExceptionsFilter();
    const { host, status } = hostWith();

    expect(() => filter.catch('not an error', host)).not.toThrow();
    expect(status).toHaveBeenCalledWith(500);
  });

  it('still classifies a BadRequestException as a client error, not 500', () => {
    const filter = new AllExceptionsFilter();
    const { host, status } = hostWith();

    filter.catch(new BadRequestException('Validasi gagal.'), host);

    expect(status).toHaveBeenCalledWith(400);
  });
});
