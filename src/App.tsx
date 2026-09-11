import { Watchlist } from "./views/Watchlist/Watchlist";
import "./theme/tokens.css";
import "./App.css";

function App() {
  return (
    <main>
      <div className="topbar">
        <div className="wordmark">
          <span className="dot" />
          TwitchTrack
        </div>
      </div>
      <Watchlist />
    </main>
  );
}

export default App;
