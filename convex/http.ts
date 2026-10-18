import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { privacyHtml } from './privacy';

/** Routes HTTP publiques, servies sur https://<déploiement>.convex.site. */
const http = httpRouter();

http.route({
  path: '/confidentialite',
  method: 'GET',
  handler: httpAction(async () => {
    return new Response(privacyHtml(), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
    });
  }),
});

export default http;
