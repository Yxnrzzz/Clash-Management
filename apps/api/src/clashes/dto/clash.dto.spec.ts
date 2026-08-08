// class-validator's decorators read/write design-time type metadata via
// reflect-metadata; NestJS's own bootstrap loads this as a side effect
// normally, but a spec that only imports the DTO in isolation needs it too.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'crypto';
import { BulkUpdateClashDto, ListClashesQueryDto } from './clash.dto';

describe('BulkUpdateClashDto', () => {
  it('accepts exactly 200 ids', async () => {
    const dto = plainToInstance(BulkUpdateClashDto, {
      ids: Array.from({ length: 200 }, () => randomUUID()),
      patch: { statusId: 'st-open' },
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects 201 ids — bounds how much work one bulk-update request can trigger', async () => {
    const dto = plainToInstance(BulkUpdateClashDto, {
      ids: Array.from({ length: 201 }, () => randomUUID()),
      patch: { statusId: 'st-open' },
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'ids')).toBe(true);
  });
});

describe('ListClashesQueryDto', () => {
  it('accepts pageSize up to 500', async () => {
    const dto = plainToInstance(ListClashesQueryDto, { pageSize: '500' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects pageSize above 500 — GET /clashes/export is the unpaginated path now, not a huge pageSize here', async () => {
    const dto = plainToInstance(ListClashesQueryDto, { pageSize: '501' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'pageSize')).toBe(true);
  });
});
