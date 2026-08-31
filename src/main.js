import worker from "./worker.js";
import {
  ensureJamesReservations,
  hideReservedJamesFromClosedPublicList
} from "./auto-james.js";

async function safelyEnsureJamesReservations(env) {
  try {
    await ensureJamesReservations(env);
  } catch (error) {
    console.error("Automatic James reservation failed:", error?.message || error);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      await safelyEnsureJamesReservations(env);
    }

    const response = await worker.fetch(request, env, ctx);

    try {
      return await hideReservedJamesFromClosedPublicList(response, url, env);
    } catch (error) {
      console.error("Hidden James public filtering failed:", error?.message || error);
      return response;
    }
  },

  scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      await safelyEnsureJamesReservations(env);

      const pending = [];
      const proxyCtx = {
        waitUntil(promise) {
          pending.push(Promise.resolve(promise));
        }
      };

      worker.scheduled(controller, env, proxyCtx);
      await Promise.all(pending);

      // Monday automation may have created a brand-new session.
      await safelyEnsureJamesReservations(env);
    })());
  }
};
