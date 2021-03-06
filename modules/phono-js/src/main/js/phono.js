;function Phono(config) {

   // Define defualt config and merge from constructor
   this.config = Phono.util.extend({
      gateway: "gw-v6.d.phono.com",
      connectionUrl: window.location.protocol+"//app.phono.com/http-bind"
   }, config);
   if (this.config.connectionUrl.indexOf("file:")==0){
      this.config.connectionUrl = "https://app.phono.com/http-bind";
   }

   // Bind 'on' handlers
   Phono.events.bind(this, config);
   
   if(!config.apiKey) {
      this.config.apiKey = prompt("Please enter your Phono API Key.\n\nTo get a new one sign up for a free account at: http://www.phono.com");
      if(!this.config.apiKey) {
         var message = "A Phono API Key is required. Please get one at http://www.phono.com";
         Phono.events.trigger(this, "error", {
            reason: message
         });
         throw message;
      }
   }
   
   // Initialize Fields
   this.sessionId = null;
   Phono.log.debug("ConnectionUrl: " + this.config.connectionUrl);

   // Existing connection?
   this.connection = this.config.connection || new Strophe.Connection(this.config.connectionUrl);

   if(navigator.appName.indexOf('Internet Explorer')>0){
    xmlSerializer = {};
    xmlSerializer.serializeToString = function(body) {return body.xml;};
   } else {
    xmlSerializer = new XMLSerializer();
   }
   this.connection.xmlInput = function (body) {
       Phono.log.debug("[WIRE] (i) " + xmlSerializer.serializeToString(body));
   };

   this.connection.xmlOutput = function (body) {
       Phono.log.debug("[WIRE] (o) " + xmlSerializer.serializeToString(body));
   };

   // Wrap ourselves with logging
   Phono.util.loggify("Phono", this);

   this.connect();
   
};

(function() {
   
    // ======================================================================
   
    //@Include=phono.util.js
    //@Include=phono.logging.js
   
    // ======================================================================

   
   // Global
   Phono.version = "0.5";
   
   Phono.log = new PhonoLogger();
   
   Phono.registerPlugin = function(name, config) {
      if(!Phono.plugins) {
         Phono.plugins = {};
      }
      Phono.plugins[name] = config;
   };

   // ======================================================================

   Phono.prototype.connect = function() {

      // If this is our own internal connection
      if(!this.config.connection) {
         if(!this.connection.connected) {
            this.connection.connect(
               this.config.gateway, 
               null, 
               this.handleStropheStatusChange,
               50
            );
         }
      }
      else {
          new PluginManager(this, this.config, function(plugins) {
              this.handleConnect();
          }).init();
      }
   };

   Phono.prototype.disconnect = function() {
      this.connection.disconnect();
   };

   Phono.prototype.connected = function() {
      return this.connection.connected;
   };

   Phono.prototype.handleStropheStatusChange = function(status) {
      if (status === Strophe.Status.CONNECTED) {
          new PluginManager(this, this.config, function(plugins) {
              this.handleConnect();
          }).init();
      } else if (status === Strophe.Status.DISCONNECTED) {
          this.handleDisconnect();
      } else if (status === Strophe.Status.ERROR 
                 || status === Strophe.Status.CONNFAIL 
                 || status === Strophe.Status.CONNFAIL 
                 || status === Strophe.Status.AUTHFAIL) {
          this.handleError();
      }
   };

   // Fires when the underlying Strophe Connection is estabilshed
   Phono.prototype.handleConnect = function() {
       var phono = this;
       phono.sessionId = Strophe.getBareJidFromJid(this.connection.jid);

       if (!this.config.connection) {
           var apiKeyIQ = $iq(
               {type:"set"})
               .c("apikey", {xmlns:"http://phono.com/apikey"})
               .t(phono.config.apiKey).up()
               .c("caps", {xmlns:"http://phono.com/caps", ver:Phono.version});
           
           // Loop over all plugins adding any caps that we have
           for(pluginName in Phono.plugins) {
               if (phono[pluginName] && phono[pluginName].getCaps) {
                   apiKeyIQ = phono[pluginName].getCaps(apiKeyIQ.c(pluginName));
                   apiKeyIQ.up();
               }
           }
           apiKeyIQ = apiKeyIQ.c('browser',{version:navigator.appVersion, agent:navigator.userAgent}).up();
           
           phono.connection.sendIQ(apiKeyIQ, 
                                   phono.handleKeySuccess,
                                   function() {
                                       Phono.events.trigger(phono, "error", {
                                           reason: "API key rejected"
                                       });
                                   });
           if(phono.config.provisioningUrl) {
               phono.connection.send(
                   $iq({type:"set"})
                       .c("provisioning", {xmlns:"http://phono.com/provisioning"})
                       .t(phono.config.provisioningUrl)
               );
           }
       } else {
           Phono.events.trigger(this, "ready");
       }
   };

   Phono.prototype.handleKeySuccess = function() {
       Phono.events.trigger(this, "ready");
   }
   // Fires when the underlying Strophe Connection errors out
   Phono.prototype.handleError = function() {
      Phono.events.trigger(this, "error", {
         reason: "Error connecting to XMPP server"
      });
   };

   // Fires when the underlying Strophe Connection disconnects
   Phono.prototype.handleDisconnect = function() {
      Phono.events.trigger(this, "unready");
   };

   // ======================================================================

   //@Include=flXHR.js
   //@Include=strophe.js   
   //@Include=strophe.cors.js
   //@Include=phono.events.js
   //@Include=flashembed.min.js
   //@Include=$phono-audio
   //@Include=phono.messaging.js
   //@Include=phono.sdp.js
   //@Include=phono.phone.js

   // ======================================================================

   Strophe.log = function(level, msg) {
       Phono.log.debug("[STROPHE] " + msg);
   };

   // Register Loggign Callback
   Phono.events.add(Phono.log, "log", function(event) {
      var date = event.timeStamp;
      var formattedDate = 
            Phono.util.padWithZeroes(date.getHours(), 2) + ":" + 
            Phono.util.padWithZeroes(date.getMinutes(), 2) + ":" + 
            Phono.util.padWithZeroes(date.getSeconds(), 2) + "." +
            Phono.util.padWithZeroes(date.getMilliseconds(), 3);
      var formattedMessage = formattedDate + " " + Phono.util.padWithSpaces(event.level.name, 5) + " - " + event.getCombinedMessages();
      var throwableStringRep = event.getThrowableStrRep();
      if (throwableStringRep) {
        formattedMessage += newLine + throwableStringRep;
      }
      console.log(formattedMessage);
   });

   // PluginManager is responsible for initializing plugins an 
   // notifying when all plugins are initialized
   function PluginManager(phono, config, readyHandler) {
      this.index = 0;
      this.readyHandler = readyHandler;
      this.config = config;
      this.phono = phono;
      this.pluginNames = new Array();
      for(pluginName in Phono.plugins) {
         this.pluginNames.push(pluginName);
      }
   };

   PluginManager.prototype.init = function(phono, config, readyHandler) {
      this.chain();
   };

   PluginManager.prototype.chain = function() {
      var manager = this;
      var pluginName = manager.pluginNames[this.index];
      Phono.plugins[pluginName].create(manager.phono, manager.config[pluginName], function(plugin) {
         manager.phono[pluginName] = plugin;
         manager.index++;
         if(manager.index === manager.pluginNames.length) {
            manager.readyHandler.apply(manager.phono);
         }
         else {
            manager.chain();
         }
      });
   };
   
})();

