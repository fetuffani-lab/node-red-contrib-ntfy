module.exports = function(RED) {
    "use strict";
    function NtfyCredentialsNode(n) {
        RED.nodes.createNode(this, n);
        this.name = n.name;
        this.server = n.server;
        // Ensure server URL does not end with a slash, as topic will be appended after a slash.
        if (this.server && this.server.endsWith('/')) {
            this.server = this.server.slice(0, -1);
        }
        this.username = n.username;
        if (this.credentials) {
            this.password = this.credentials.password;
            this.accessToken = this.credentials.accessToken;
        }
    }
    RED.nodes.registerType("ntfy-credentials", NtfyCredentialsNode, {
        credentials: {
            password: {type: "password"},
            accessToken: {type: "password"}
        }
    });
}