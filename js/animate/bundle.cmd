:: --external:canvas (to not try to incorporate a dependency; leave the import)
:: --minify --sourcemap --target=es2020,chrome58,firefox57,safari11
@PUSHD "%~dp0"
esbuild index.js --bundle --format=esm --outfile=out/bundle.js --loader:.webp=dataurl --loader:.png=dataurl %*
@POPD