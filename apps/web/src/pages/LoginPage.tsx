import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUserSession } from '../stores/user-session';
import { toastSuccess } from '../stores/toast';
import './login-page.css';

type Mode = 'login' | 'register';

/** 品牌 Mark：取景框 + 胶片孔，古铜金描边，可随主题变色 */
export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className="nx9-login-mark"
    >
      <defs>
        <linearGradient id="nx9-mark-gold" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e4c58f" />
          <stop offset="0.55" stopColor="#c4a574" />
          <stop offset="1" stopColor="#8a6a3c" />
        </linearGradient>
      </defs>
      {/* 外框（取景框） */}
      <rect x="4" y="4" width="40" height="40" rx="8" stroke="url(#nx9-mark-gold)" strokeWidth="2.4" />
      {/* 内框（画面） */}
      <rect x="12" y="12" width="24" height="24" rx="3" stroke="url(#nx9-mark-gold)" strokeWidth="1.4" opacity="0.75" />
      {/* 胶片孔（左/右） */}
      <rect x="7.5" y="14" width="2.2" height="5" rx="1" fill="url(#nx9-mark-gold)" opacity="0.9" />
      <rect x="7.5" y="22" width="2.2" height="5" rx="1" fill="url(#nx9-mark-gold)" opacity="0.9" />
      <rect x="7.5" y="30" width="2.2" height="5" rx="1" fill="url(#nx9-mark-gold)" opacity="0.9" />
      <rect x="38.3" y="14" width="2.2" height="5" rx="1" fill="url(#nx9-mark-gold)" opacity="0.9" />
      <rect x="38.3" y="22" width="2.2" height="5" rx="1" fill="url(#nx9-mark-gold)" opacity="0.9" />
      <rect x="38.3" y="30" width="2.2" height="5" rx="1" fill="url(#nx9-mark-gold)" opacity="0.9" />
      {/* 画面中的山与日（极简） */}
      <path d="M15 31 L22 20 L27 27 L31 23 L35 31 Z" fill="url(#nx9-mark-gold)" opacity="0.5" />
      <circle cx="31.5" cy="17.5" r="3" fill="url(#nx9-mark-gold)" opacity="0.85" />
    </svg>
  );
}

export function LoginPage() {
  const login = useUserSession((s) => s.login);
  const register = useUserSession((s) => s.register);
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(() => resolveDark());
  const nameRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 明暗双套：优先读画布主题偏好，否则跟随系统并监听变化
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setDark(resolveDark());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    nameRef.current?.focus();
  }, [mode]);

  const reportError = useCallback((msg: string) => {
    setError(msg);
    // 直接对根容器重触发抖动动画，避免 key 重挂载清空表单
    if (rootRef.current) {
      rootRef.current.style.animation = 'none';
      void rootRef.current.offsetWidth;
      rootRef.current.style.animation = 'nx9-login-shake 380ms ease';
    }
  }, []);

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setError(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      const clean = name.trim();
      if (!clean) return reportError('请输入昵称');
      if (password.length < 6) return reportError('密码至少 6 位');
      if (mode === 'register' && password !== confirm) {
        return reportError('两次输入的密码不一致');
      }
      setSubmitting(true);
      setError(null);
      try {
        const { adoptedLegacy } =
          mode === 'login'
            ? await login(clean, password)
            : await register(clean, password);
        if (adoptedLegacy) {
          toastSuccess('已接管本机原有项目数据，欢迎回来');
        } else if (mode === 'register') {
          toastSuccess('工作室已创建，欢迎加入 NX9');
        }
        // 成功后由 AppShell 依据 status 切换到主界面
      } catch (err) {
        reportError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, name, password, confirm, mode, login, register, reportError],
  );

  const brandLine = useMemo(
    () => (mode === 'login' ? '欢迎回来，继续你的创作' : '创建你的专属工作室'),
    [mode],
  );

  return (
    <div
      ref={rootRef}
      className={`nx9-login ${dark ? 'is-dark' : 'is-light'}`}
      data-mode={mode}
    >
      {/* 左侧品牌区 */}
      <aside className="nx9-login__brand">
        <div className="nx9-login__brand-glow" aria-hidden="true" />
        <div className="nx9-login__brand-noise" aria-hidden="true" />
        <div className="nx9-login__brand-frame" aria-hidden="true" />
        <div className="nx9-login__brand-content">
          <div className="nx9-login__brand-badge">
            <BrandMark size={46} />
          </div>
          <h1 className="nx9-login__brand-title">NX9 Studio</h1>
          <p className="nx9-login__brand-tagline">AI 影视创作工作台</p>
          <p className="nx9-login__brand-sub">
            从剧本到成片，让每一帧都出自你的手笔
          </p>
        </div>
        <footer className="nx9-login__brand-foot">
          <span>NX9 · Desktop Studio</span>
          <span className="nx9-login__brand-dot" />
          <span>v0.1.0</span>
        </footer>
      </aside>

      {/* 右侧表单区 */}
      <main className="nx9-login__panel">
        <div className="nx9-login__card">
          <div className="nx9-login__card-mark">
            <BrandMark size={34} />
          </div>
          <h2 className="nx9-login__heading">{mode === 'login' ? '欢迎回来' : '创建工作室'}</h2>
          <p className="nx9-login__lead">{brandLine}</p>

          <div className="nx9-login__seg" role="tablist" aria-label="登录或注册">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`nx9-login__seg-btn ${mode === 'login' ? 'is-on' : ''}`}
              onClick={() => switchMode('login')}
            >
              登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`nx9-login__seg-btn ${mode === 'register' ? 'is-on' : ''}`}
              onClick={() => switchMode('register')}
            >
              注册
            </button>
          </div>

          <form className="nx9-login__form" onSubmit={handleSubmit} noValidate>
            <label className="nx9-login__field">
              <span className="nx9-login__label">昵称</span>
              <input
                ref={nameRef}
                type="text"
                className="nx9-login__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="你的昵称，登录账号"
                autoComplete="username"
                maxLength={24}
              />
            </label>

            <label className="nx9-login__field">
              <span className="nx9-login__label">密码</span>
              <input
                type="password"
                className="nx9-login__input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>

            {mode === 'register' && (
              <label className="nx9-login__field nx9-login__field--fade">
                <span className="nx9-login__label">确认密码</span>
                <input
                  type="password"
                  className="nx9-login__input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="再输入一次"
                  autoComplete="new-password"
                />
              </label>
            )}

            {error && (
              <p className="nx9-login__error" role="alert">
                {error}
              </p>
            )}

            {mode === 'register' && (
              <p className="nx9-login__legacy-hint">
                首次使用：注册后将自动接管本机原有项目数据。
              </p>
            )}

            <button
              type="submit"
              className="nx9-login__submit"
              disabled={submitting}
            >
              {submitting ? (
                <span className="nx9-login__spinner" aria-hidden="true" />
              ) : null}
              {submitting
                ? mode === 'login'
                  ? '正在进入…'
                  : '正在创建…'
                : mode === 'login'
                  ? '进入工作室'
                  : '创建并进入'}
            </button>
          </form>

          <p className="nx9-login__foot">
            {mode === 'login' ? '还没有工作室？' : '已有工作室？'}
            <button
              type="button"
              className="nx9-login__switch"
              onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? '立即注册' : '去登录'}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}

function resolveDark(): boolean {
  try {
    const manual = localStorage.getItem('nx9:canvas_theme');
    if (manual === 'dark') return true;
    if (manual === 'light') return false;
  } catch {
    /* ignore */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
