import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Pulls the project id that ProjectContextGuard verified and attached to the request. */
export const ActiveProject = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest<{ activeProjectId: string }>().activeProjectId,
);
