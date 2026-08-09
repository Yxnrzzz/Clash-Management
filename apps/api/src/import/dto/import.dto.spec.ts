import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CommitImportDto } from './import.dto';

const VALID_MAPPING = {
  title: 'judul',
  disciplineCode: 'disiplin',
  zoneName: 'zona',
  priorityName: 'prioritas',
  description: 'deskripsi',
};

function commitDtoWith(token: string) {
  return plainToInstance(CommitImportDto, { token, fileName: 'x.csv', mapping: VALID_MAPPING });
}

describe('CommitImportDto.token', () => {
  it('accepts a token shaped like a real storage key from ImportService.preview', async () => {
    const errors = await validate(commitDtoWith('imports/3f6e9c1a-9b2e-4b7a-8f0a-clashes.csv'));
    expect(errors.some((e) => e.property === 'token')).toBe(false);
  });

  // StorageService.readStream/delete resolve this value straight into a
  // filesystem path — this is the only shape that keeps it confined to
  // StorageService's own "imports/" prefix, matching what saveFromPath()
  // ever actually produces.
  it.each([
    ['../../etc/passwd', 'traversal'],
    ['/etc/passwd', 'absolute path'],
    ['imports/../../../etc/passwd', 'traversal nested under the prefix'],
    ['attachments/other-clash-file.png', 'a different prefix entirely'],
    ['', 'empty string'],
  ])('rejects %s (%s)', async (token) => {
    const errors = await validate(commitDtoWith(token));
    expect(errors.some((e) => e.property === 'token')).toBe(true);
  });
});
