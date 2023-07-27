import { rest } from 'msw';

export const handlers = [
  rest.get(`${window.COMMA_URL_ROOT}v1/me`, (req, res, ctx) => res(
    ctx.status(200),
    ctx.json({
      email: 'user@example.com',
      id: '0123456789abcdef',
      points: 1234,
      prime: false,
      regdate: 1661280980,
      superuser: false,
      user_id: 'fake_user_id',
      username: 'cameron',
    }),
  )),
];
