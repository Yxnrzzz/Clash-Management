import 'reflect-metadata';
import { AuthController } from './auth.controller';
import { SKIP_PROJECT_SCOPE_KEY } from '../common/decorators/skip-project-scope.decorator';

describe('AuthController', () => {
  // Regression test for the lockout bug: a freshly created user has no
  // project membership yet (see UsersService.create) and must be able to
  // hit POST /auth/change-password and GET /auth/me before ever having an
  // X-Project-Id to send. Without this decorator, ProjectContextGuard's
  // deny-by-default check 403s every request here and the user can never
  // get past the mandatory password change.
  it('opts out of ProjectContextGuard so a project-less user is never locked out', () => {
    expect(Reflect.getMetadata(SKIP_PROJECT_SCOPE_KEY, AuthController)).toBe(true);
  });
});
