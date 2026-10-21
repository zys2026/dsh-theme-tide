/**
 * Tide & Timber — browser half template.
 *
 * Build step: tools/build.mjs injects the palette and layer identity, then
 * writes ../client.js. The shipped bundle is a plain IIFE that registers one
 * __ModuleLoader__ factory; materialization happens lazily on first use.
 *
 * Design notes:
 *  - `ctx.theme.overrideTokens` is the official extension point for third-party
 *    palettes: it stacks a token layer over whichever built-in theme is active
 *    (light / dark / system) without touching the theme registry or the
 *    persisted `ui-theme` preference. Every value is a {light, dark} pair, so
 *    switching Appearance re-composes our palette in the new scheme.
 *  - The layer is registered inside `ctx.effect`, so disabling the plugin,
 *    hot-reloading it, or a failed mount retracts exactly this layer.
 *  - No DOM manipulation beyond what the theme presenter already does: the
 *    official ThemePresenter projects the snapshot onto `body`, which keeps us
 *    compatible with layout changes and future DSH releases.
 */
(function () {
  'use strict';

  var SOURCE = '__SOURCE__';
  var LIGHT = __LIGHT__;
  var DARK = __DARK__;

  var TOKENS = {};
  Object.keys(LIGHT).forEach(function (name) {
    TOKENS[name] = { light: LIGHT[name], dark: DARK[name] || LIGHT[name] };
  });

  window.__ModuleLoader__.load({
    id: SOURCE,
    factory: function () {
      function apply(ctx) {
        if (!ctx.theme || typeof ctx.theme.overrideTokens !== 'function') {
          console.warn('[tide-and-timber] theme service unavailable; palette not applied');
          return;
        }
        ctx.effect(function () {
          return ctx.theme.overrideTokens(SOURCE, TOKENS);
        }, 'tide-and-timber: alias token layer');
      }

      return {
        inject: ['theme'],
        apply: apply,
      };
    },
  });
})();
