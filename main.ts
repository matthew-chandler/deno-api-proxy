import { Application } from "https://deno.land/x/oak@v11.1.0/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts"
import { format } from "https://deno.land/std@0.91.0/datetime/mod.ts";
import { load } from "https://deno.land/std@0.223.0/dotenv/mod.ts";
import * as path from "https://deno.land/std@0.223.0/path/mod.ts";
import { RateLimiter } from "https://deno.land/x/oak_rate_limit@v0.1.1/mod.ts";

// initialize env variables
const env = await load();
const PORT = parseInt(env.PORT) || 5000;
const API_BASE_URL = env.API_BASE_URL;
const API_KEY_NAME = env.API_KEY_NAME;
const API_KEY_VALUE = env.API_KEY_VALUE;
const CLIENT_URL = env.CLIENT_URL || "*";
const RATE_REQUEST_MAX = env.RATE_REQUEST_MAX || 50;
const RATE_WINDOW_MS = env.RATE_WINDOW_MS || 86400000;

const app = new Application();

// rate limiting
const rateLimit = RateLimiter({
  windowMs: RATE_WINDOW_MS, // 1 day in number of milliseconds
  max: RATE_REQUEST_MAX, // maximum of 50 requests per day
  message: "Too many requests, please try again later.",
});
app.use(await rateLimit);

// CORS
app.use(oakCors({
  origin : CLIENT_URL,
  methods : "GET,OPTIONS",
  allowedHeaders : "X-Requested-With,content-type"
}),);

// logger
app.use(async (ctx, next) => {
  const start = Date.now();
  const url = ctx.request.url.toString();
  await next(); // run the rest of the middleware before continuing, i.e. finish logging at the end

  // assign context details
  const ms = Date.now() - start;
  const responseTime = `${ms}ms`;
  const date = format(new Date(), "yyyy-MM-dd HH:mm:ss.SSS");
  const ip = ctx.request.headers.get("x-forwarded-for") || ctx.request.ip;
  const method = ctx.request.method;

  // append context details to log
  const log: string = `${date} ${responseTime} ${ip} ${method} ${url}\n`
  await Deno.writeTextFile(path.resolve("./requests.log"), log, {
    append: true,
  });
});

// fetching
app.use(async (ctx) => {
  try {
    // get input parameters
    const inputParameters = ctx.request.url.searchParams;
    // if request does not contain its own API key, append proxy's API key to the parameters
    if (!inputParameters.has(API_KEY_NAME)) {
      inputParameters.append(API_KEY_NAME, API_KEY_VALUE)
    }

    // fetch and load response
    const full_url: string = `${API_BASE_URL}?${ctx.request.url.searchParams.toString()}`;
    const apiResponse: Response = await fetch(full_url);
    ctx.response.status = 200;
    ctx.response.body = apiResponse.body;
  }
  // assign 500 status if error
  catch (error) { 
    console.error(`Error: ${error}`);
    ctx.response.status = 500;
  }
});

await app.listen({ port: PORT });