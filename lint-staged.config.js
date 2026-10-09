export default {
  "*.{ts,tsx}": ["oxlint --fix", "oxfmt", () => "npm run types"],
  "*.{json,yml,yaml}": ["oxfmt"],
};
