`public-route.json` contains the noncredential metadata fields used by navigation
regressions, retrieved on 2026-10-08 from the public route that backs the existing
`/demo` backend:

https://api.comma.ai/v1/devices/5beb9b58bd12b691/routes_segments?route_str=5beb9b58bd12b691%7C0000010a--a51155e496

The existing demo backend identifies this source in `src/api/demo.js`. The fixture
omits share credentials, user/VIN fields and locations; the retained fields are
unchanged from that response. Test-only `log_id` and `duration` are derived by the
same transformation as `checkRoutesData`. Request/command stubs and jsdom verify
navigation and ownership; they are not browser playback or device evidence.
