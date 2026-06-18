var R = (typeof window !== "undefined" && window.React) || {};
function jsx(type, props, key) {
  return R.createElement(type, key === void 0 ? props : Object.assign({ key: key }, props));
}
module.exports = { jsx: jsx, jsxs: jsx, jsxDEV: jsx, Fragment: R.Fragment };
