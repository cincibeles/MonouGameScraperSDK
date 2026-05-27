var MonouGameScraperLib = {
	$SharedData: {
		gameKey: '',
		waiting: false,
		secure: false,
		canLog: false,
		specs: false,
		mRec: null,
		canvas: null,
		canvasStream: null,

		// ---------- Firma HMAC (sin async/await, compatible Unity 2019) ----------
		generateSignature: function (secret, bodyStr) {
			var encoder = new TextEncoder();
			return crypto.subtle.importKey(
				"raw", encoder.encode(secret),
				{ name: "HMAC", hash: "SHA-256" }, false, ["sign"]
			).then(function(key) {
				return crypto.subtle.sign("HMAC", key, encoder.encode(bodyStr));
			}).then(function(sig) {
				return Array.from(new Uint8Array(sig)).map(function(b){
					return b.toString(16).padStart(2, "0");
				}).join("");
			});
		},

		// ---------- Envío de mensajes al padre (postMessage) ----------
		// Recupera la lógica original: separa val numérico (val) de string (str)
		send: function(gameKey, type, val){
			SharedData.waiting = false;
			var parse_int = parseInt(val);
			var data = {
				key: gameKey,
				type: type,
				val: parse_int || 0,
				str: (isNaN(parse_int) && val || "").toString()
			};
			var dataJSON = JSON.stringify(data);
			SharedData.generateSignature(gameKey, dataJSON).then(function(hash){
				var message = { hash: hash, data: dataJSON };
				window.parent.postMessage(
					JSON.stringify(message),
					"*"
				);
			}).catch(function(e){
				// Si falla la firma (p. ej. crypto.subtle no disponible), no romper el juego
				console.warn("MonouGameScraper: error generando firma", e);
			});
		},

		// ---------- Handlers de eventos para el scrapper log ----------
		// Bindeados en start_log para mantener referencia correcta de this
		_onMM: null, _onMD: null, _onMU: null, _onKD: null, _onKU: null,

		// ---------- Inicio del scrapper log (grabación de canvas + eventos) ----------
		start_log: function(){
			// Detección de capacidades: si el navegador no soporta lo necesario, salir limpiamente
			if (typeof MediaRecorder === 'undefined') {
				console.warn("MonouGameScraper: MediaRecorder no soportado, scrapper log desactivado");
				return;
			}

			try {
				SharedData.canvas = document.getElementsByTagName('canvas')[0];
				if (!SharedData.canvas || typeof SharedData.canvas.captureStream !== 'function') {
					console.warn("MonouGameScraper: canvas.captureStream no disponible, scrapper log desactivado");
					return;
				}

				SharedData.canvasStream = SharedData.canvas.captureStream(30);

				// Elegir el mejor codec disponible
				var mimeType = "video/webm; codecs=vp8";
				if (typeof MediaRecorder.isTypeSupported === 'function' && !MediaRecorder.isTypeSupported(mimeType)) {
					mimeType = "video/webm; codecs=vp8";
					if (!MediaRecorder.isTypeSupported(mimeType)) {
						mimeType = "video/webm";
					}
				}

				SharedData.mRec = new MediaRecorder(SharedData.canvasStream, { mimeType: mimeType });
				SharedData.mRec.ondataavailable = function(event){
					if (event.data && event.data.size > 0) {
						var reader = new FileReader();
						reader.onloadend = function(){
							SharedData.send(SharedData.gameKey, "_scrapper_chunk", reader.result);
						};
						reader.readAsDataURL(event.data);
					}
				};

				SharedData.send(SharedData.gameKey, "_scrapper_chunk_init", false);

				// Bindear handlers una sola vez para poder removerlos después
				SharedData._onMM = function(e){
					var pt = (e.touches && e.touches[0]) || e;
					SharedData.send(SharedData.gameKey, "_scrapper_mm", JSON.stringify(["MOUSE_MOVE", [pt.pageX, pt.pageY]]));
				};
				SharedData._onMD = function(e){ SharedData.send(SharedData.gameKey, "_scrapper_md", JSON.stringify(["MOUSE_BUTTON", [1, true, pt.pageX, pt.pageY]])); };
				SharedData._onMU = function(e){ SharedData.send(SharedData.gameKey, "_scrapper_mu", JSON.stringify(["MOUSE_BUTTON", [1, false]])); };
				SharedData._onKD = function(e){ SharedData.send(SharedData.gameKey, "_scrapper_kd", JSON.stringify(["KEYBOARD", [e.keyCode, true]])); };
				SharedData._onKU = function(e){ SharedData.send(SharedData.gameKey, "_scrapper_ku", JSON.stringify(["KEYBOARD", [e.keyCode, false]])); };

				window.addEventListener("mousemove", SharedData._onMM);
				window.addEventListener("touchmove", SharedData._onMM);
				window.addEventListener("mousedown", SharedData._onMD);
				window.addEventListener("touchstart", SharedData._onMD);
				window.addEventListener("mouseup", SharedData._onMU);
				window.addEventListener("touchend", SharedData._onMU);
				window.addEventListener("keydown", SharedData._onKD);
				window.addEventListener("keyup", SharedData._onKU);

				SharedData.mRec.start(1000);

				// Specs de hardware. navigator.gpu puede no existir en navegadores antiguos.
				SharedData.specs = {
					"game_slug": "$game_slug",
					"game_resolution": [SharedData.canvas.height, SharedData.canvas.width],
					"hardware_specs": {
						"cpu": (navigator && navigator.hardwareConcurrency) || 0,
						"memory": (navigator && navigator.deviceMemory) || 0,
						"gpus": 0,
						"user_agent": (navigator && navigator.userAgent) || ""
					},
					"start_timestamp": Date.now(),
					"average_fps": 30
				};

				// Intento opcional de obtener GPUs (WebGPU). Si no existe, se queda en 0.
				if (navigator && navigator.gpu && typeof navigator.gpu.requestAdapter === 'function') {
					try {
						navigator.gpu.requestAdapter().then(function(adapter){
							if (adapter && adapter.features && typeof adapter.features.size === 'number') {
								SharedData.specs.hardware_specs.gpus = adapter.features.size;
							}
						}).catch(function(){ /* ignorar */ });
					} catch(e) { /* ignorar */ }
				}
			} catch(e) {
				console.warn("MonouGameScraper: error iniciando scrapper log", e);
				SharedData.mRec = null;
				SharedData.canvas = null;
				SharedData.canvasStream = null;
			}
		},

		// ---------- Fin del scrapper log ----------
		finish_log: function(){
			if (!SharedData.mRec) return;
			try {
				SharedData.mRec.stop();
				if (SharedData.specs) {
					SharedData.specs.end_timestamp = Date.now();
					SharedData.specs.duration = SharedData.specs.end_timestamp - SharedData.specs.start_timestamp;
					SharedData.send(SharedData.gameKey, "_scrapper_chunk_finish", JSON.stringify(SharedData.specs));
				}
				if (SharedData.canvasStream) {
					SharedData.canvasStream.getTracks().forEach(function(track){ track.stop(); });
				}
			} catch(e) {
				console.warn("MonouGameScraper: error finalizando scrapper log", e);
			}

			SharedData.canvasStream = null;
			SharedData.canvas = null;
			SharedData.mRec = null;
			SharedData.specs = null;

			if (SharedData._onMM) {
				window.removeEventListener("mousemove", SharedData._onMM);
				window.removeEventListener("touchmove", SharedData._onMM);
				window.removeEventListener("mousedown", SharedData._onMD);
				window.removeEventListener("touchstart", SharedData._onMD);
				window.removeEventListener("mouseup", SharedData._onMU);
				window.removeEventListener("touchend", SharedData._onMU);
				window.removeEventListener("keydown", SharedData._onKD);
				window.removeEventListener("keyup", SharedData._onKU);
				SharedData._onMM = SharedData._onMD = SharedData._onMU = SharedData._onKD = SharedData._onKU = null;
			}
		}
	},

	// ============================================================
	//   Funciones exportadas a Unity (DllImport "__Internal")
	// ============================================================

	MonouGameScraper_Init: function(kPointer){
		SharedData.gameKey = UTF8ToString(kPointer);
		SharedData.send(SharedData.gameKey, "init", false);

		window.addEventListener('message', function(event) {
			// FIX CRÍTICO: doble JSON.parse con try/catch
			// event.data viene como string (postMessage usa JSON.stringify)
			// y dentro contiene otro string JSON en el campo "data".
			// Sin esto, mensajes de extensiones/scripts ajenos rompen el SDK.

			var eventData;
			try {
				if (typeof event.data === 'string') {
					eventData = JSON.parse(event.data || "{}");
				} else if (typeof event.data === 'object' && event.data !== null) {
					// Algunos navegadores/entornos pueden pasar objeto directo
					eventData = event.data;
				} else {
					return;
				}
			} catch(e) {
				return; // No es JSON válido, lo ignoramos en silencio
			}

			if (!eventData || typeof eventData !== 'object') return;
			if (typeof eventData.hash !== 'string') return;

			var data;
			try {
				if (typeof eventData.data === 'string') {
					data = JSON.parse(eventData.data || "{}");
				} else if (typeof eventData.data === 'object' && eventData.data !== null) {
					data = eventData.data;
				} else {
					data = {};
				}
			} catch(e) {
				return;
			}

			if (eventData.hash == "test") {
				SharedData.waiting = data;
				SharedData.canLog = true;
				SharedData.secure = false;
				return;
			}

			// Verificación de firma para mensajes legítimos
			var bodyForSig = (typeof eventData.data === 'string') ? eventData.data : JSON.stringify(eventData.data || {});
			SharedData.generateSignature(SharedData.gameKey, bodyForSig).then(function(computedHash){
				if (eventData.hash != computedHash) return;
				switch (data.type) {
					case "ad":
					case "adReward":
					case "sell":
						SharedData.waiting = data;
						SharedData.secure = true;
						break;
					case "log":
						SharedData.canLog = !!data.success;
						break;
				}
			}).catch(function(){ /* ignorar errores de firma */ });
		});
	},

	MonouGameScraper_Send: function(customKey, customVal){
		var key = UTF8ToString(customKey);
		SharedData.send(SharedData.gameKey, key, customVal);
	},

	MonouGameScraper_Start: function(){
		SharedData.send(SharedData.gameKey, "start", false);
		if (SharedData.canLog) SharedData.start_log();
	},

	MonouGameScraper_Finish: function(score){
		SharedData.send(SharedData.gameKey, "finish", score);
		SharedData.finish_log();
	},

	MonouGameScraper_Advance: function(delta){
		SharedData.send(SharedData.gameKey, "advance", delta);
	},

	MonouGameScraper_Advertise: function(taskId){
		SharedData.send(SharedData.gameKey, "ad", false);
		SharedData.waiting = false;
		var interval = setInterval(function(){
			if (!SharedData.waiting) return;
			clearInterval(interval);
			SendMessage('GameScraper', 'WorkAsyncResult', taskId + "|0");
		}, 100);
	},

	MonouGameScraper_AdvertiseRewarded: function(taskId){
		SharedData.send(SharedData.gameKey, "adReward", false);
		SharedData.waiting = false;
		var interval = setInterval(function(){
			if (!SharedData.waiting) return;
			clearInterval(interval);
			var v = (SharedData.waiting && SharedData.waiting.success) ? 1 : 0;
			SendMessage('GameScraper', 'WorkAsyncResult', taskId + "|" + v);
		}, 100);
	},

	MonouGameScraper_Sell: function(amount, taskId){
		SharedData.send(SharedData.gameKey, "sell", amount);
		SharedData.waiting = false;
		var interval = setInterval(function(){
			if (!SharedData.waiting) return;
			clearInterval(interval);
			var v = (SharedData.waiting && SharedData.waiting.success) ? 1 : 0;
			SendMessage('GameScraper', 'WorkAsyncResult', taskId + "|" + v);
		}, 100);
	}
};

autoAddDeps(MonouGameScraperLib, '$SharedData');
mergeInto(LibraryManager.library, MonouGameScraperLib);
