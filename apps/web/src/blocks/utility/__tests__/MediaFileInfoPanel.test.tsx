import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadImageElement } from '../../shared/image-crop';
import { MediaFileInfoPanel } from '../MediaFileInfoPanel';

vi.mock('../../shared/image-crop', () => ({
  loadImageElement: vi.fn(),
}));

const mockedLoadImageElement = vi.mocked(loadImageElement);

describe('MediaFileInfoPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads source metadata and image dimensions', async () => {
    const image = document.createElement('img');
    Object.defineProperties(image, {
      naturalWidth: { value: 1920 },
      naturalHeight: { value: 1080 },
    });
    mockedLoadImageElement.mockResolvedValue(image);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-length': String(2 * 1024 * 1024),
        'content-type': 'image/png',
        'last-modified': 'Wed, 21 Oct 2026 07:28:00 GMT',
      }),
    });

    const onClose = vi.fn();
    render(
      <MediaFileInfoPanel
        url="/media/images/test-image.png"
        pinKind="picture"
        label="测试图像"
        onClose={onClose}
      />,
    );

    expect(await screen.findByText('测试图像')).toBeTruthy();
    expect(screen.getByText('test-image.png')).toBeTruthy();
    expect(await screen.findByText('1920 × 1080px')).toBeTruthy();
    expect(screen.getByText('2.0 MB')).toBeTruthy();
    expect(screen.getByText('图像 · PNG')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
