// Prints a fresh Ed25519 key pair for licences: the private JWK is a Worker
// secret (LICENSE_PRIVATE_JWK); the public JWK ships inside the desktop app.
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
console.log("LICENSE_PRIVATE_JWK=" + JSON.stringify(await crypto.subtle.exportKey("jwk", privateKey)));
console.log("Public JWK (desktop/src/main/license.ts):");
console.log(JSON.stringify(await crypto.subtle.exportKey("jwk", publicKey)));
