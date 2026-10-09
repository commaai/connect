#!/bin/sh
# Generates a seven-day test CA and a LAN server certificate. Installs no trust.
# Usage: sh scripts/playback-bench/make-test-cert.sh 192.168.0.153
set -eu
ip=${1:?Pass the computer LAN IPv4 address}
case "$ip" in *[!0-9.]*|'') echo 'Expected an IPv4 address' >&2; exit 1;; esac
folder=test-results/playback/tls
mkdir -p "$folder"
umask 077
cat > "$folder/ca.conf" <<CONFIG
[req]
distinguished_name=dn
x509_extensions=ca
prompt=no
[dn]
CN=Connect Local Playback Test CA
[ca]
basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign,cRLSign
CONFIG
cat > "$folder/server.conf" <<CONFIG
[req]
distinguished_name=dn
prompt=no
[dn]
CN=Connect Local Playback Test
CONFIG
cat > "$folder/extensions.conf" <<CONFIG
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:$ip,IP:127.0.0.1,DNS:localhost
CONFIG
openssl req -x509 -newkey rsa:2048 -nodes -days 7 -config "$folder/ca.conf" -keyout "$folder/ca.key" -out "$folder/ca.pem" 2>/dev/null
openssl req -newkey rsa:2048 -nodes -config "$folder/server.conf" -keyout "$folder/server.key" -out "$folder/server.csr" 2>/dev/null
openssl x509 -req -in "$folder/server.csr" -CA "$folder/ca.pem" -CAkey "$folder/ca.key" -CAcreateserial -days 7 -extfile "$folder/extensions.conf" -out "$folder/server.pem" 2>/dev/null
openssl x509 -in "$folder/ca.pem" -outform der -out "$folder/connect-test-ca.cer"
openssl x509 -in "$folder/ca.pem" -noout -fingerprint -sha256
