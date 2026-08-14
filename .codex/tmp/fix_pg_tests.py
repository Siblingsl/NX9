# -*- coding: utf-8 -*-
import io


def replace_one(path, old, new, label):
    with io.open(path, 'r', encoding='utf-8') as f:
        text = f.read()
    crlf = '\r\n' in text
    text = text.replace('\r\n', '\n')
    idx = text.find(old)
    if idx < 0:
        raise SystemExit('NOT FOUND: ' + label)
    if text.find(old, idx + len(old)) >= 0:
        raise SystemExit('MULTIPLE: ' + label)
    text = text[:idx] + new + text[idx + len(old):]
    if crlf:
        text = text.replace('\n', '\r\n')
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(text)
    print('applied ' + label)


refs = r'F:\code\project\NX9\apps\web\src\engine\__tests__\picture-gen-refs.test.ts'

# PG-38: excluded refs
old1 = """    expect(send.primary).toBe('https://user/ref.png');
    expect(send.extras).toContain('https://char/look.png');
    expect(send.extras).toContain('https://env/bg.png');
  });
});"""
new1 = """    expect(send.primary).toBe('https://user/ref.png');
    expect(send.extras).toContain('https://char/look.png');
    expect(send.extras).toContain('https://env/bg.png');
  });

  it('PG-38 排除的注入参考不再进发送集合，也不升模式', () => {
    const send = resolvePictureSendRefs({
      data: { excludedRefUrls: ['https://char/look.png'] },
      characterRef: 'https://char/look.png',
      envRef: 'https://env/bg.png',
    });
    expect(send.mode).toBe('image-to-image');
    expect(send.primary).toBe('https://env/bg.png');
    expect(send.injected).toEqual([{ url: 'https://env/bg.png', role: 'environment' }]);
  });

  it('PG-38 全部注入被排除时回落文生图', () => {
    const send = resolvePictureSendRefs({
      data: {
        excludedRefUrls: ['https://char/look.png', 'https://env/bg.png'],
      },
      characterRef: 'https://char/look.png',
      envRef: 'https://env/bg.png',
    });
    expect(send.mode).toBe('text-to-image');
    expect(send.primary).toBeUndefined();
    expect(send.injected).toEqual([]);
  });
});"""
replace_one(refs, old1, new1, 'pg38-excluded-refs')

# PG-45: history meta
old2 = """    expect(restored?.history.some((h) => h.urls[0] === 'new.png')).toBe(true);
  });
});"""
new2 = """    expect(restored?.history.some((h) => h.urls[0] === 'new.png')).toBe(true);
  });

  it('PG-45 归档存用户原稿与发送稿，恢复可回读', () => {
    const history = archivePictureGeneration(
      ['old.png'],
      'polluted prompt',
      [],
      1000,
      { userPrompt: 'a cat', compiledPrompt: 'a cat, cinematic [Composition]' },
    );
    expect(history[0].userPrompt).toBe('a cat');
    expect(history[0].compiledPrompt).toContain('[Composition]');
    const restored = restorePictureGeneration(
      history[0].id,
      ['new.png'],
      'new',
      history,
      2000,
    );
    expect(restored?.userPrompt).toBe('a cat');
    expect(restored?.compiledPrompt).toContain('[Composition]');
  });
});"""
replace_one(refs, old2, new2, 'pg45-history-meta')

# PG-38: success patch writes real mode
old3 = """    expect(patch.previewUrls).toEqual(['/media/a.png']);
  });
});"""
new3 = """    expect(patch.previewUrls).toEqual(['/media/a.png']);
  });

  it('PG-38 成功 patch 回写实际发送模式', () => {
    const patch = buildPictureGenSuccessPatch({
      urls: ['/media/a.png'],
      pictureGenMode: 'image-to-image',
    });
    expect(patch.pictureGenMode).toBe('image-to-image');
    expect(patch.useImageReference).toBe(true);
  });
});"""
replace_one(refs, old3, new3, 'pg38-patch-mode')

modes = r'F:\code\project\NX9\apps\web\src\engine\__tests__\picture-gen-modes-auto.test.ts'
with io.open(modes, 'r', encoding='utf-8') as f:
    modes_text = f.read()
modes_crlf = '\r\n' in modes_text
modes_text = modes_text.replace('\r\n', '\n')
modes_text += """
describe('PG-37 runPrompt 优先于 content', () => {
  it('runPrompt 非空时优先，content 不被当作发送稿', () => {
    expect(
      resolvePictureGenRunPrompt({ runPrompt: 'run prompt', content: 'user prompt' }),
    ).toBe('run prompt');
  });

  it('空白 runPrompt 回退用户 content', () => {
    expect(
      resolvePictureGenRunPrompt({ runPrompt: '   ', content: 'user prompt' }),
    ).toBe('user prompt');
  });

  it('无 runPrompt 时读 content', () => {
    expect(resolvePictureGenRunPrompt({ content: 'user prompt' })).toBe('user prompt');
  });
});
"""
if modes_crlf:
    modes_text = modes_text.replace('\n', '\r\n')
with io.open(modes, 'w', encoding='utf-8', newline='') as f:
    f.write(modes_text)
print('applied pg37-run-prompt tests')

# import resolvePictureGenRunPrompt into modes test
with io.open(modes, 'r', encoding='utf-8') as f:
    modes_text = f.read()
modes_crlf = '\r\n' in modes_text
modes_text = modes_text.replace('\r\n', '\n')
old_import = """} from '../stage-deck/chrome/attached-workspace/generation/picture/picture-gen-modes';"""
new_import = """  resolvePictureGenRunPrompt,
} from '../stage-deck/chrome/attached-workspace/generation/picture/picture-gen-modes';"""
idx = modes_text.find(old_import)
if idx < 0:
    raise SystemExit('NOT FOUND: modes import anchor')
modes_text = modes_text[:idx] + new_import + modes_text[idx + len(old_import):]
if modes_crlf:
    modes_text = modes_text.replace('\n', '\r\n')
with io.open(modes, 'w', encoding='utf-8', newline='') as f:
    f.write(modes_text)
print('applied pg37-modes-import')
