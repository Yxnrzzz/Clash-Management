import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StorageService } from './storage.service';

function makeService(secret = 'test-secret-at-least-16-chars') {
  const config = { get: jest.fn(() => secret) } as unknown as ConfigService;
  return new StorageService(config);
}

function makeServiceWithUploadDir(uploadDir: string) {
  const config = {
    get: jest.fn((key: string) =>
      key === 'UPLOAD_DIR' ? uploadDir : 'test-secret-at-least-16-chars',
    ),
  } as unknown as ConfigService;
  return new StorageService(config);
}

describe('StorageService signed URLs', () => {
  it('verifies a token it just signed', () => {
    const service = makeService();
    const { token, expiresAt } = service.signKey('attachment:a1');

    expect(service.verifySignedKey('attachment:a1', token, expiresAt)).toBe(true);
  });

  it('rejects a token once its expiry has passed', () => {
    const service = makeService();
    const { token } = service.signKey('attachment:a1', 1000);

    expect(service.verifySignedKey('attachment:a1', token, Date.now() - 1)).toBe(false);
  });

  it('rejects a token signed for a different key', () => {
    const service = makeService();
    const { token, expiresAt } = service.signKey('attachment:a1');

    expect(service.verifySignedKey('attachment:a2', token, expiresAt)).toBe(false);
  });

  it('rejects a token with one character flipped', () => {
    const service = makeService();
    const { token, expiresAt } = service.signKey('attachment:a1');
    const flippedLastChar = token.slice(0, -1) + (token.at(-1) === '0' ? '1' : '0');

    expect(service.verifySignedKey('attachment:a1', flippedLastChar, expiresAt)).toBe(false);
  });

  it('rejects a non-hex/garbage token instead of throwing', () => {
    const service = makeService();
    const { expiresAt } = service.signKey('attachment:a1');

    expect(() => service.verifySignedKey('attachment:a1', 'not-a-real-token', expiresAt)).not.toThrow();
    expect(service.verifySignedKey('attachment:a1', 'not-a-real-token', expiresAt)).toBe(false);
  });

  it('rejects a non-numeric/NaN expiresAt instead of treating it as valid', () => {
    const service = makeService();
    const { token } = service.signKey('attachment:a1');

    expect(service.verifySignedKey('attachment:a1', token, Number('not-a-number'))).toBe(false);
  });

  it('two different secrets never agree on the same token', () => {
    const serviceA = makeService('secret-a-at-least-16-chars');
    const serviceB = makeService('secret-b-at-least-16-chars');
    const { token, expiresAt } = serviceA.signKey('attachment:a1');

    expect(serviceB.verifySignedKey('attachment:a1', token, expiresAt)).toBe(false);
  });
});

describe('StorageService.delete', () => {
  let uploadDir: string;

  beforeEach(async () => {
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clashhub-storage-test-'));
  });

  afterEach(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
  });

  it('removes a file previously written by save()', async () => {
    const service = makeServiceWithUploadDir(uploadDir);
    const { key } = await service.save(Buffer.from('hello'), 'clash-1', 'photo.png');
    const absolutePath = path.join(uploadDir, key);
    expect(await fs.readFile(absolutePath, 'utf-8')).toBe('hello');

    await service.delete(key);

    await expect(fs.readFile(absolutePath, 'utf-8')).rejects.toThrow();
  });

  it('is a no-op for a file that does not exist', async () => {
    const service = makeServiceWithUploadDir(uploadDir);

    await expect(service.delete('clash-1/does-not-exist.png')).resolves.toBeUndefined();
  });

  it('is a no-op for an empty key', async () => {
    const service = makeServiceWithUploadDir(uploadDir);

    await expect(service.delete('')).resolves.toBeUndefined();
  });

  it('rejects a key that traverses outside the upload root', async () => {
    const service = makeServiceWithUploadDir(uploadDir);

    await expect(service.delete('../../etc/passwd')).rejects.toThrow('Kunci penyimpanan tidak valid.');
  });

  it('rejects a key that resolves to a directory rather than a file', async () => {
    const service = makeServiceWithUploadDir(uploadDir);
    await fs.mkdir(path.join(uploadDir, 'clash-1'), { recursive: true });

    await expect(service.delete('clash-1')).rejects.toThrow();
    // The directory (and anything in it) must survive a rejected delete.
    expect(await fs.stat(path.join(uploadDir, 'clash-1'))).toBeTruthy();
  });
});
