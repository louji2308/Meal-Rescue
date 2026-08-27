module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    overrides: [
      {
        test: (filename) =>
          filename &&
          (filename.endsWith(".ts") || filename.endsWith(".tsx")),
        plugins: ["@babel/plugin-transform-typescript"],
      },
    ],
  };
};
