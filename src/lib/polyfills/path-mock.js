/**
 * Lightweight browser-side polyfill for Node's 'path' module
 * Solves 'path.resolve is not a function' in GramJS/Next.js bundle.
 */
module.exports = {
  resolve: function (...args) {
    return args.filter(Boolean).join('/');
  },
  join: function (...args) {
    return args.filter(Boolean).join('/');
  },
  dirname: function (p) {
    const parts = p.split('/');
    if (parts.length <= 1) return '.';
    parts.pop();
    return parts.join('/') || '/';
  },
  basename: function (p) {
    return p.split('/').pop() || '';
  },
  extname: function (p) {
    const base = p.split('/').pop() || '';
    const idx = base.lastIndexOf('.');
    return idx < 0 ? '' : base.slice(idx);
  }
};
