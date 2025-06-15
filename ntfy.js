module.exports = function(RED) {
    "use strict";
    const fetch = require('node-fetch');
    const https = require('https');

    function NtfyNode(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.serverConfigNode = RED.nodes.getNode(config.serverConfig);
        this.topic = config.topic;
        this.priority = config.priority;
        this.title = config.title;
        this.message = config.message;
        this.tags = config.tags;
        this.icon = config.icon;
        this.click = config.click;
        this.attach = config.attach;
        this.filename = config.filename;
        this.actions = config.actions; // Expects a string, potentially multi-line
        this.email = config.email;
        this.delay = config.delay;
        this.cache = config.cache;
        this.firebase = config.firebase;
        this.insecure = config.insecure || false;

        let node = this;

        if (!node.serverConfigNode || !node.serverConfigNode.server) {
            node.error("Ntfy server configuration is missing or incomplete.");
            node.status({fill:"red", shape:"ring", text:"config error"});
            return;
        }
        
        const ntfyServerBaseUrl = node.serverConfigNode.server;

        node.on('input', async function(msg, send, done) {
            const topic = msg.topic || node.topic;
            let messageBody = msg.payload !== undefined ? (typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload)) : node.message;
            const title = msg.title || node.title;
            const priority = msg.priority || node.priority;
            const tags = msg.tags || node.tags; // Expects comma-separated string or array from msg.tags
            const iconUrl = msg.icon || node.icon;
            const clickUrl = msg.click || node.click;
            const attachUrl = msg.attach || node.attach;
            const filename = msg.filename || node.filename;
            const actions = msg.actions || node.actions; // Can be string (from config) or array/string from msg
            const email = msg.email || node.email;
            const delay = msg.delay || node.delay;
            const cache = msg.cache || node.cache;
            const firebase = msg.firebase || node.firebase;

            if (!topic) {
                node.error("Topic not configured or provided in msg.topic", msg);
                node.status({fill:"red", shape:"ring", text:"no topic"});
                if (done) { done(); }
                return;
            }

            // Ntfy expects the message in the request body. Other parameters are headers.
            const headers = {};
            if (title) headers['Title'] = title;
            if (priority) headers['Priority'] = priority.toString();
            
            if (tags) {
                if (Array.isArray(tags)) {
                    headers['Tags'] = tags.join(',');
                } else if (typeof tags === 'string') {
                    headers['Tags'] = tags;
                }
            }
            if (iconUrl) headers['Icon'] = iconUrl;
            if (clickUrl) headers['Click'] = clickUrl;
            if (attachUrl) headers['Attach'] = attachUrl;
            if (filename && attachUrl) headers['Filename'] = filename; // Filename is only useful with Attach
            if (email) headers['Email'] = email;
            if (delay) headers['Delay'] = delay;
            if (cache) headers['Cache'] = cache;
            if (firebase) headers['Firebase'] = firebase;

            if (actions) {
                if (typeof actions === 'string') {
                    headers['Actions'] = actions.trim(); // Use directly if string (e.g. from config textarea)
                } else if (Array.isArray(actions)) {
                    // If msg.actions is an array, try to format it.
                    // Each item could be a pre-formatted string or an object {type, label, url, clear?, ...}
                    headers['Actions'] = actions.map(action => {
                        if (typeof action === 'string') return action;
                        if (typeof action === 'object' && action.type && action.label && action.url) {
                            let actionStr = `${action.type}, ${action.label}, ${action.url}`;
                            if (action.clear !== undefined) actionStr += `, clear=${action.clear}`;
                            // Basic support for method, headers, body if provided as strings
                            if (action.method) actionStr += `, method=${action.method}`;
                            if (action.headers) actionStr += `, headers=${typeof action.headers === 'string' ? action.headers : JSON.stringify(action.headers)}`;
                            if (action.body) actionStr += `, body=${typeof action.body === 'string' ? action.body : JSON.stringify(action.body)}`;
                            return actionStr;
                        }
                        return null; // Invalid action object
                    }).filter(Boolean).join('; ');
                }
            }

            // Authentication
            if (node.serverConfigNode.accessToken) {
                headers['Authorization'] = `Bearer ${node.serverConfigNode.accessToken}`;
            } else if (node.serverConfigNode.username && node.serverConfigNode.password) {
                const B64 = Buffer.from(`${node.serverConfigNode.username}:${node.serverConfigNode.password}`).toString('base64');
                headers['Authorization'] = `Basic ${B64}`;
            }
            
            const fullUrl = `${ntfyServerBaseUrl}/${topic}`;
            
            const fetchOptions = {
                method: 'POST',
                headers: headers,
                body: messageBody || "" // ntfy allows empty body if other headers (like Title) are set
            };

            if (fullUrl.startsWith('https://') && node.insecure) {
                fetchOptions.agent = new https.Agent({
                    rejectUnauthorized: false
                });
            }

            node.status({fill:"blue", shape:"dot", text:"sending..."});

            try {
                const response = await fetch(fullUrl, fetchOptions);
                if (!response.ok) {
                    const errorBody = await response.text();
                    node.error(`Ntfy API error: ${response.status} ${response.statusText} - ${errorBody}`, msg);
                    node.status({fill:"red", shape:"ring", text:`API error ${response.status}`});
                } else {
                    node.status({fill:"green", shape:"dot", text:"sent"});
                }
            } catch (err) {
                node.error(`Failed to send Ntfy message: ${err.message}`, msg);
                node.status({fill:"red", shape:"ring", text:"send error"});
                if (err.code === 'EPROTO' || (err.message && err.message.toLowerCase().includes('wrong version number'))) {
                    node.warn("SSL Error (EPROTO/wrong version number). Ensure server URL scheme (http/https) is correct. If using self-signed certs or specific TLS versions, 'Allow insecure HTTPS' might help for cert validation but not for protocol mismatches.");
                }
            }

            if (done) { done(); }
        });

        node.on('close', function() {
            node.status({});
        });
    }
    RED.nodes.registerType("ntfy", NtfyNode);
}