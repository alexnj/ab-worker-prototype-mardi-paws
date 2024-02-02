export interface Env {}

import { parse } from 'cookie';
import packageJson from '../package.json';
import { Experimentation } from '../sdks/npm/src/index'
import { applyTransformations } from '../sdks/npm/src/cf/transformer';

type ABConfigurationAPIResponse = {transformations: Experimentation.Transform[]};
const identificationString = `${packageJson.name}/${packageJson.version}`;

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Rewrite only read operations.
    if (request.method !== 'GET') return new Response(null, {status: 405});

    const { host, pathname, search, searchParams } = new URL(request.url);
    const cookies = parse(request.headers.get('cookie') || '');
    // The new user personalization currently is:
    // ?experiment=siakaramalegos/ab-worker-prototype-mardi-paws/main/experiments/new-user-personalization.json?token=GHSAT0AAAAAACJ6H63YIGF4XGPVCXHMDT7SZN4BMTA
    const experiment = searchParams.get('experiment') ?? cookies['experiment'] ?? '';
    const rewrittenControlUrl = new URL(pathname + search, 'https://mardipaws.myshopify.com/');
    const controlRequest = fetch(rewrittenControlUrl, {
      headers: {
        'content-type': 'text/html;charset=utf-8',
        // Modify this request just enough to make rewrites work and
        // identify ourselves if Shopify wants to filter traffic.
        'user-agent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36 ${identificationString}`,
      },
    });
    // Cheap wrangler-cli [l] dev check
    const isLocalDevMode = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    // If no experipment requested, return control.
    // if (!experiment) {
    //   const controlResponse = await controlRequest;
    //   const mutableResponse = new Response(controlResponse.body, controlResponse);
    //   mutableResponse.headers.set('set-cookie', `experiment=${experiment}; Secure; Path=/`);
    //   return mutableResponse;
    // }
    const abConfigurationRequest = fetch(`https://raw.githubusercontent.com/${experiment}`);
    const federatedCalls = new Array<Promise<Response>>(controlRequest, abConfigurationRequest);
    const responses = await Promise.all(federatedCalls);
    const controlResponse = responses[0];
    // const abConfiguration = await responses[1].json() as ABConfigurationAPIResponse;
    // const transformations = abConfiguration.transformations;

    // const mutableResponse = new Response(controlResponse.body, controlResponse);
    // mutableResponse.headers.set('set-cookie', `experiment=${experiment}; Secure; Path=/`);
    // return applyTransformations(mutableResponse, transformations);
    let buffer  // NEW

    class DomainRewriter {
      _replace(text) {
        return text.replaceAll("mardipaws.myshopify.com", "localhost:8787");
      }

      async element(el) {
        if (el.hasAttribute('src')) {
          const oldSrc = el.getAttribute('src');
          el.setAttribute('src', this._replace(oldSrc));
        }
        if (el.hasAttribute('href')) {
          const oldHref = el.getAttribute('href');
          el.setAttribute('href', this._replace(oldHref));
        }
      }

      text(text) {
        buffer += text.text
        if (text.lastInTextNode) {
          text.replace(this._replace(buffer))
          buffer = ""
        } else {
          text.remove()
        }
      }
    }

  const r = new HTMLRewriter({ html: true })
        .on("*", new DomainRewriter())
        .transform(controlResponse)

        return r;
  }
};
