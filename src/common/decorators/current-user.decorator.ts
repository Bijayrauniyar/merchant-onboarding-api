import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Parameter decorator to extract the authenticated user object (or a specific property)
 * attached to the request by JwtStrategy.
 *
 * @example
 * handler(@CurrentUser() user: AuthUser)
 * handler(@CurrentUser('id') userId: string)
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
