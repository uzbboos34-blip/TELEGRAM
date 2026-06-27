/**
 * Lightweight browser-side polyfill for Node's 'dns' module.
 * Prevents 'dns.resolve is not a function' inside GramJS update loop.
 */
module.exports = {
  lookup: function (hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options;
    }
    // Browserda WebSocket ulanishi uchun hostname'ni address sifatida qaytaramiz
    setTimeout(() => callback(null, hostname, 4), 0);
  },
  resolve: function (hostname, rrtype, callback) {
    if (typeof rrtype === 'function') {
      callback = rrtype;
    }
    setTimeout(() => callback(null, [hostname]), 0);
  },
  promises: {
    lookup: async function (hostname) {
      return { address: hostname, family: 4 };
    },
    resolve: async function (hostname) {
      return [hostname];
    }
  }
};
