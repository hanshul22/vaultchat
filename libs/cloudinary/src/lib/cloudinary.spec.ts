import { cloudinary } from './cloudinary';

describe('cloudinary', () => {
  it('should work', () => {
    expect(cloudinary()).toEqual('cloudinary');
  });
});
