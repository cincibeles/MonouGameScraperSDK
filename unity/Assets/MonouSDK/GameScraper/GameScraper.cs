/*
// First set Monou Key

// on start match
Monou.GameScraper.Starts();

// Each time the player int added points
// passes the added points, not the total score
Monou.GameScraper.Advance( addedPoints ); 

// on finish match passes int total score
Monou.GameScraper.Finish( totalScore ); 

// for show a advertise
await Monou.GameScraper.Advertise();

// for show arvertise rewarded, the flag returs boolean success or not
bool playerSawTheAd = await Monou.GameScraper.AdvertiseRewarded();

// for sell products or dcl in your games, the flag returs boolean success or not
bool playerBoughtTheItem = await MonouGame.GameScraper.Sell();
*/
using System;
using System.Runtime.InteropServices;
using UnityEngine;
using System.Collections;
using System.Threading.Tasks;

namespace Monou
{
    public class GameScraper : MonoBehaviour
    {
        public string MonouKey;

        public static GameScraper inst;
        void Awake(){
            if(GameScraper.inst == null){ GameScraper.inst = this; DontDestroyOnLoad(gameObject); }
            else Destroy(gameObject);
        }

       // Diccionario para almacenar los TaskCompletionSource y manejarlos por ID
        private static System.Collections.Generic.Dictionary<int, TaskCompletionSource<int>> pendingTasks = new System.Collections.Generic.Dictionary<int, TaskCompletionSource<int>>();
        private static int nextTaskId = 0;

        public static async Task<int> WaitTask(Action<int> fn){
            var tcs = new TaskCompletionSource<int>();
            int currentTaskId = nextTaskId++;
            pendingTasks.Add(currentTaskId, tcs);
            fn.Invoke(currentTaskId);
            int result = await tcs.Task;
            return result;
        }
        public void WorkAsyncResult(string message){ // Recibe un string "taskId|result"
            string[] parts = message.Split('|');
            if (parts.Length < 2) return;
            int taskId = int.Parse(parts[0]);
            int result = int.Parse(parts[1]);

            if (pendingTasks.Remove(taskId, out var tcs)){
                // Establece el resultado, lo que libera el 'await' en StartAsyncAction
                tcs.SetResult(result);
                //Debug.Log("C#: Resultado recibido y Task completada para TaskId: " + taskId);
            }
        }

#if UNITY_WEBGL && !UNITY_EDITOR

        // Import the JavaScript functions
        [DllImport("__Internal")]
        private static extern void MonouGameScraper_Init(string key);
        [DllImport("__Internal")]
        private static extern void MonouGameScraper_Send(string key, int val);
        [DllImport("__Internal")]
        private static extern void MonouGameScraper_Start();
        [DllImport("__Internal")]
        private static extern void MonouGameScraper_Finish(int score);
        [DllImport("__Internal")]
        private static extern void MonouGameScraper_Advance(int points);
        [DllImport("__Internal")]
        private static extern void MonouGameScraper_Advertise(int taskId);
        [DllImport("__Internal")]
        private static extern void MonouGameScraper_AdvertiseRewarded(int taskId);
        [DllImport("__Internal")]
        private static extern void MonouGameScraper_Sell(int amount, int taskId);

        void Start(){ MonouGameScraper_Init(MonouKey); }

        public static void Send(string key, int val){ MonouGameScraper_Send(key, val); }
        public static void Starts(){ MonouGameScraper_Start(); }
        public static void Finish(int score){ MonouGameScraper_Finish(score); }
        public static void Advance(int points){ MonouGameScraper_Advance(points); }
        public static async Task<bool> Advertise(){
            return await WaitTask(taskId => GameScraper.MonouGameScraper_Advertise(taskId)) == 1;
        }
        public static async Task<bool> AdvertiseRewarded(){
            return await WaitTask(taskId => GameScraper.MonouGameScraper_AdvertiseRewarded(taskId)) == 1;
        }
        public static async Task<bool> Sell(int amount){
            return await WaitTask(taskId => GameScraper.MonouGameScraper_Sell(amount, taskId)) == 1;
        }
#else
        void Start(){ Debug.Log("Monou.GameScraper init with Key: "+MonouKey); }
        public static void Send(){ Debug.Log("Monou.GameScraper match Starts"); }
        public static void Starts(){ Debug.Log("Monou.GameScraper match Starts"); }
        public static void Finish(int score){ Debug.Log("Monou.GameScraper match Finish: "+score); }
        public static void Advance(int points){ Debug.Log("Monou.GameScraper match Advance: "+points); }
        public static async Task<bool> Advertise(){
            Debug.Log("Monou.GameScraper show Advertise");
            await WaitTask(GameScraper.inst.Delay);
            return false;
        }
        public static async Task<bool> AdvertiseRewarded(){
            Debug.Log("Monou.GameScraper show Advertise Rewarded");
            return await WaitTask(GameScraper.inst.Delay) == 1;
        }
        public static async Task<bool> Sell(int amount){
            Debug.Log("Monou.GameScraper try Sell");
            return await WaitTask(GameScraper.inst.Delay) == 1;
        }

        void Delay(int taskId){ StartCoroutine(_Delay(taskId)); }
        IEnumerator _Delay(int taskId){
            yield return new WaitForSeconds(2F);
            WorkAsyncResult($"{taskId}|{(UnityEngine.Random.Range(0f,10f)>5f? 1:0)}");
        }
#endif
    }

}
