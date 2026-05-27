var MonouGameScraperLib = {
	$SharedData: {
		gameKey: '',
		waiting: false,
		secure: false,
		canLog: false,
		specs: false,
		generateSignature: async function (secret, bodyStr) {
		  var encoder = new TextEncoder();
		  var key = await crypto.subtle.importKey(
		    "raw",encoder.encode(secret),
		    { name: "HMAC", hash: "SHA-256" },false,["sign"]
		   );
		  var sig = await crypto.subtle.sign("HMAC", key, encoder.encode(bodyStr));
		  return Array.from(new Uint8Array(sig)).map(function(b){ return b.toString(16).padStart(2, "0") }).join("");
		},
		send: async function(gameKey, type, val){
			this.waiting = false;
			var parse_int = parseInt(val);
			const data = { key: this.gameKey, type: type, val: parse_int||0, str: (isNaN(parse_int) && val || "").toString() };
			const dataJSON = JSON.stringify(data);
			const message = {hash:await this.generateSignature(gameKey, dataJSON), data:dataJSON};
			window.parent.postMessage(
				JSON.stringify(message),
				//"https://monou.gg/"
			);
		},
		mRec: null, canvas: null, canvasStream: null,
		onMM: function(e){ this.send(this.gameKey, "_scrapper_mm", (e => ["MOUSE_MOVE", [e.pageX, e.pageY]])(e.touch && e.touch[0] || e)); },
		onMD: function(e){ this.send(this.gameKey, "_scrapper_md", ["MOUSE_BUTTON", [1, true]], false); },
		onMU: function(e){ this.send(this.gameKey, "_scrapper_mu", ["MOUSE_BUTTON", [1, false]], false); },
		onKD: function(e){ this.send(this.gameKey, "_scrapper_kd", ["KEYBOARD", [e.keyCode, true]], false); },
		onKU: function(e){ this.send(this.gameKey, "_scrapper_ku", ["KEYBOARD", [e.keyCode, false]], false); },
		start_log: async function(){
			this.canvas = document.getElementsByTagName('canvas')[0];
			this.canvasStream = this.canvas.captureStream(30);
			this.mRec = new MediaRecorder(this.canvasStream, { mimeType: "video/webm; codecs=vp8" });
			this.mRec.ondataavailable = (event) => { 
				if (event.data.size > 0) {
					const reader = new FileReader();
					reader.onloadend = () => { this.send(this.gameKey, "_scrapper_chunk", false, reader.result); }
					reader.readAsDataURL(event.data);
				}
			};
			this.send(this.gameKey, "_scrapper_chunk_init", false, false);
			window.addEventListener("mousemove", this.onMM.bind(this)); window.addEventListener("touchmove", this.onMM.bind(this));
			window.addEventListener("mousedown", this.onMD.bind(this)); window.addEventListener("touchstart", this.onMD.bind(this));
			window.addEventListener("mouseup", this.onMU.bind(this)); window.addEventListener("touchend", this.onMU.bind(this));
			window.addEventListener("keydown", this.onKD.bind(this));
			window.addEventListener("keyup", this.onKU.bind(this));
			this.mRec.start(1000);
			var gpu = (navigator && navigator.gpu && navigator.gpu.requestAdapter && await navigator.gpu.requestAdapter());
			this.specs = {
				"game_slug": "$game_slug",
				"game_resolution": [this.canvas.height, this.canvas.width],
				"hardware_specs": {
					"cpu": navigator && navigator.hardwareConcurrency,
					"memory": navigator && navigator.deviceMemory,
					"gpus": navigator && navigator.gpu && (navigator.gpu.requestAdapter && await navigator.gpu.requestAdapter()).features.size,
					"user_agent": navigator && navigator.userAgent
				},
				"start_timestamp": Date.now(),
				"average_fps": 30
			};
		},
		finish_log: function(){
			if(!this.mRec) return;
			this.mRec.stop();
			this.specs.end_timestamp = Date.now();
			this.specs.duration = this.specs.end_timestamp - this.specs.start_timestamp;
			this.send(this.gameKey, "_scrapper_chunk_finish", this.specs, false);
			this.canvasStream.getTracks().forEach(track => track.stop());
			this.canvasStream = this.canvas = this.mRec = this.mRec.onstop = this.mRec.ondataavailable = this.specs = null;
			window.removeEventListener("mousemove", this.onMM); window.removeEventListener("touchmove", this.onMM);
			window.removeEventListener("mousedown", this.onMD); window.removeEventListener("touchstart", this.onMD);
			window.removeEventListener("mouseup", this.onMU); window.removeEventListener("touchend", this.onMU);
			window.removeEventListener("keydown", this.onKD);
			window.removeEventListener("keyup", this.onKU);
		},
	},
	MonouGameScraper_Init: function(kPointer){
		SharedData.gameKey = UTF8ToString(kPointer);
		SharedData.send(SharedData.gameKey, "init", false);
		window.addEventListener('message', async function(event) {
			const eventData = JSON.parse(event.data || "{}");
			const data = JSON.parse(eventData && eventData.data || "{}");
			if (eventData.hash == "test") { SharedData.waiting = data; SharedData.canLog = true; SharedData.secure = false; return; }
			if (eventData.hash != await SharedData.generateSignature(SharedData.gameKey, eventData.data)) return;
			switch (data.type) {
				case "ad": case "adReward": case "sell": SharedData.waiting = data; secure = true; break;
				case "log": SharedData.canLog = data.success; break;
			}
		});
	},
	MonouGameScraper_Send: function(customKey, customVal){
		var key = UTF8ToString(customKey);
		SharedData.send(SharedData.gameKey, key, customVal)
	},
	MonouGameScraper_Start: function(){ SharedData.send(SharedData.gameKey, "start", false); SharedData.canLog && SharedData.start_log.apply(SharedData); },
	MonouGameScraper_Finish: function(score){ SharedData.send(SharedData.gameKey, "finish", score);  SharedData.finish_log.apply(SharedData); },
	MonouGameScraper_Advance: function(delta){ SharedData.send(SharedData.gameKey, "advance", delta) },
	MonouGameScraper_Advertise: function(taskId){
		SharedData.send(SharedData.gameKey, "ad", false);
		SharedData.waiting = false;
		var interval = setInterval(function(){
			if(!SharedData.waiting) return;
			clearInterval(interval);
			//resolve(SharedData.waiting.success);
			SendMessage('MonouGameScraper', 'WorkAsyncResult', taskId+"|0");
		},100);
	},
	MonouGameScraper_AdvertiseRewarded: function(taskId){
		SharedData.send(SharedData.gameKey, "adReward", false);
		SharedData.waiting = false;
		var interval = setInterval(function(){
			if(!SharedData.waiting) return;
			clearInterval(interval);
			var v = SharedData.waiting && SharedData.waiting.success && 1 || 0;
			SendMessage('MonouGameScraper', 'WorkAsyncResult', taskId+"|"+v);
		},100);
	},
	MonouGameScraper_Sell: function(amount, taskId){
		SharedData.send(SharedData.gameKey, "sell", amount);
		SharedData.waiting = false;
		var interval = setInterval(function(){
			if(!SharedData.waiting) return;
			clearInterval(interval);
			var v = SharedData.waiting && SharedData.waiting.success && 1 || 0;
			SendMessage('MonouGameScraper', 'WorkAsyncResult', taskId+"|"+v);
		},100);
	}
};
autoAddDeps(MonouGameScraperLib, '$SharedData');
mergeInto(LibraryManager.library, MonouGameScraperLib);