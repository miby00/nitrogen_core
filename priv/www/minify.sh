#!/bin/sh

## On ubuntu/debian machines, this will use the node/nom package uglify-js
##   $ https://www.tecmint.com/minify-css-and-js-files-linux/
## 

min="uglifyjs -c"

$min -o bert.min.js bert.js
$min -o nq.min.js nq.js
$min -o nq-dialog.min.js nq-dialog.js
$min -o nq-dnd.min.js nq-dnd.js
$min -o nq-widgets.min.js nq-widgets.js
$min -o nitrogen.min.js nitrogen.js
$min -o jquery.sparkline.min.js jquery.sparkline.js

