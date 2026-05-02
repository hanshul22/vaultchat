import { websocket } from './websocket';

describe('websocket', () => {
  it('should work', () => {
    expect(websocket()).toEqual('websocket');
  });
});
