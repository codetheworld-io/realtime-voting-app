const REST_API_URL = '{{ __REST_API_URL__ }}';
const WS_URL = '{{ __WS_API_URL__ }}';

const TOPIC_ID = 'favorite-cloud';

let socket;

connectWebSocket();

function connectWebSocket() {
  socket = new WebSocket(WS_URL);
  const dot = document.getElementById('status-dot');

  socket.onopen = () => {
    dot.classList.replace('bg-red-500', 'bg-green-500');
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.topicId === TOPIC_ID) {
      renderResult(data.result);
    }
  };

  socket.onclose = () => {
    dot.classList.replace('bg-green-500', 'bg-red-500');
    setTimeout(connectWebSocket, 2000);
  };
}

async function handleVote(option) {
  const buttons = document.querySelectorAll('.vote-btn');
  buttons.forEach(b => b.disabled = true);

  try {
    await fetch(`${REST_API_URL}/votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId: TOPIC_ID, option }),
    });
  } catch (err) {
    console.error('Vote failed:', err);
  } finally {
    setTimeout(() => buttons.forEach(b => b.disabled = false), 1000);
  }
}

function renderResult(result) {
  const options = ['optionA', 'optionB', 'optionC', 'optionD'];
  const counts = options.map((o) => result[o] || 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts, 1);

  document.getElementById('total-votes').innerText = `Total: ${total} votes`;

  options.forEach((opt) => {
    const count = result[opt] || 0;
    const percOfTotal = total === 0 ? 0 : Math.round((count / total) * 100);
    const barWidth = (count / max) * 100;

    document.getElementById(`count-${opt}`).innerText = count;
    document.getElementById(`perc-${opt}`).innerText = `${percOfTotal}%`;
    document.getElementById(`bar-${opt}`).style.width = `${barWidth}%`;
  });
}
