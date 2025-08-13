// @ts-check

const path = require('path');
const { defineConfig } = require('@rspack/cli');
const rspack = require('@rspack/core');

module.exports = (env, argv) => {
  const mode = argv?.mode || 'development';
  const isProd = mode === 'production';

  return defineConfig({
    mode,
    entry: {
      popup: './src/popup/popup.tsx',
      sidePanel: './src/sidePanel/sidePanel.tsx',
      background: './src/scripts/background.ts',
      contentScript: './src/scripts/contentScript.ts',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      // 禁止额外 runtime 与分包后产生多余 chunk，确保与 manifest 一一对应
      chunkFilename: '[name].js',
      publicPath: '',
      // 在扩展页面与 Service Worker/Content Script 环境均可用
      globalObject: 'self',
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          type: 'javascript/auto',
          use: {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                target: 'es2022',
                parser: {
                  syntax: 'typescript',
                  tsx: true,
                },
                transform: {
                  react: {
                    runtime: 'automatic',
                    development: !isProd,
                    throwIfNamespace: true,
                  },
                },
              },
              sourceMaps: !isProd,
            },
          },
        },
        {
          test: /\.css$/i,
          use: [rspack.CssExtractRspackPlugin.loader, 'css-loader', 'postcss-loader'],
        },
        {
          test: /\.(png|jpe?g|gif|svg|ico|webp|avif)$/i,
          type: 'asset/resource',
          generator: {
            filename: 'assets/[name][ext]'
          }
        },
        {
          test: /\.(woff2?|ttf|otf|eot)$/i,
          type: 'asset/resource',
          generator: {
            filename: 'assets/fonts/[name][ext]'
          }
        }
      ],
    },
    plugins: [
      new rspack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(mode),
        __DEV__: JSON.stringify(!isProd),
      }),
      new rspack.CssExtractRspackPlugin({
        filename: '[name].css',
      }),
      new rspack.HtmlRspackPlugin({
        template: './src/popup/popup.html',
        filename: 'popup.html',
        chunks: ['popup'],
        minify: isProd,
      }),
      new rspack.HtmlRspackPlugin({
        template: './src/sidePanel/sidePanel.html',
        filename: 'sidePanel.html',
        chunks: ['sidePanel'],
        minify: isProd,
      }),
      new rspack.CopyRspackPlugin({
        patterns: [
          { from: 'public', to: 'public' },
          { from: 'src/manifest.json', to: 'manifest.json' },
          { from: '_locales', to: '_locales' },
        ],
      }),
    ],
    devtool: isProd ? false : 'cheap-module-source-map',
    cache: true,
    optimization: {
      minimize: isProd,
      splitChunks: false,
      runtimeChunk: false,
    },
    performance: { hints: false },
    stats: 'errors-warnings',
    watchOptions: {
      ignored: ['**/dist/**', '**/node_modules/**'],
    },
  });
};
