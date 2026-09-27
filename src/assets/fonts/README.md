Fonts vendored here so the page keeps its own promise: once the weights are cached, no request
leaves the page. Nothing is fetched from a font CDN at runtime.

Fraunces            https://github.com/undercasetype/Fraunces        SIL Open Font License 1.1
                    latin subset, roman + italic, variable (opsz 9..144, wght 300..900)
Nunito Sans         https://github.com/googlefonts/nunito             SIL Open Font License 1.1
                    latin subset, variable (opsz 6..12, wght 300..800)

Both are OFL 1.1: free to use, redistribute and embed, provided the license travels with the
font files. This file is that notice. The OFL text is at
https://openfontlicense.org/open-font-license-official-text/

Subsetting to latin keeps them small enough to ship inside a page that already pulls a wasm engine
and ~307 MiB of model weights. If a weight or a glyph is ever missing, the stack in
src/index.css falls back to a system serif or sans and the page keeps working.
