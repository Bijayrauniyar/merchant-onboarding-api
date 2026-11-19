import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';

// Helper to extract the parameter decorator factory
function getParamDecoratorFactory(decorator: Function) {
  class TestClass {
    testMethod(@decorator() _param: any) {}
  }

  const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestClass, 'testMethod');
  const key = Object.keys(metadata)[0];
  return metadata[key].factory;
}

describe('CurrentUser Decorator', () => {
  const factory = getParamDecoratorFactory(CurrentUser);

  const createMockContext = (user?: any): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should return null if user is not present on request', () => {
    const context = createMockContext(undefined);
    const result = factory(undefined, context);
    expect(result).toBeNull();
  });

  it('should return full user object when no data property is specified', () => {
    const mockUser = { id: 'user-123', email: 'sales1@example.com', role: 'SALES' };
    const context = createMockContext(mockUser);
    const result = factory(undefined, context);
    expect(result).toEqual(mockUser);
  });

  it('should return specific property when data string is provided', () => {
    const mockUser = { id: 'user-123', email: 'sales1@example.com', role: 'SALES' };
    const context = createMockContext(mockUser);
    const result = factory('email', context);
    expect(result).toBe('sales1@example.com');
  });
});
