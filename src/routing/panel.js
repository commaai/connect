// Shared geometry and surface treatment for URL-addressable dialogs.
export const routePanelStyle = {
  position: 'absolute', boxSizing: 'border-box',
  padding: 32, width: 480, maxWidth: 'calc(100vw - 32px)',
  maxHeight: 'calc(100dvh - 48px)', overflowY: 'auto',
  left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
  borderRadius: 24, border: '1px solid rgba(255,255,255,0.10)',
  background: 'linear-gradient(150deg, #30393e, #20272b 65%)',
  boxShadow: '0 32px 100px rgba(0,0,0,0.5)', outline: 'none',
  '@media (max-width: 600px)': {
    width: '100%', maxWidth: '100%', maxHeight: 'calc(100dvh - 24px)',
    top: 'auto', bottom: 0, left: 0, transform: 'none',
    borderRadius: '24px 24px 0 0', padding: '28px 24px max(28px, env(safe-area-inset-bottom))',
  },
};
