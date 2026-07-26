fx_version 'cerulean'
game 'common'

author 'elempius'
description 'PostgreSQL connector/wrapper exposing query/scalar/execute/transaction exports'
version '0.1.2'

server_script 'dist/server.js'
client_script 'dist/client.js'

ui_page 'web/index.html'

files {
    'web/index.html',
    'web/style.css',
    'web/app.js',
}
