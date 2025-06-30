const apiKeyInput = document.getElementById('apiKey');
const recordBtn = document.getElementById('recordBtn');
const conversationDiv = document.getElementById('conversation');
const jsonOutput = document.getElementById('jsonOutput');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.lang = 'en-US';
recognition.interimResults = false;

let recording = false;
const systemPrompt = `You are an auto insurance voice assistant. Collect the following information from the user one question at a time: zipcode, number of vehicles (max two), year, make, and model for each vehicle, whether they have had insurance for 30 days, gender (male, female, or nonbinary), marital status, homeowner or renter, active or honorably discharged US military service, birthdate, first name, last name, email address, street address, and phone number. After each user response, update a JSON object with the collected information. Include this JSON on a line that begins with \u201cJSON:\u201d in your reply. Keep spoken text concise and do not read the JSON aloud.`;
let messages = [{ role: 'system', content: systemPrompt }];

recordBtn.addEventListener('click', () => {
  if (!recording) {
    recognition.start();
    recordBtn.textContent = 'Stop Recording';
    recording = true;
  } else {
    recognition.stop();
    recordBtn.textContent = 'Start Recording';
    recording = false;
  }
});

recognition.addEventListener('result', e => {
  const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
  addMessage('You', transcript);
  messages.push({ role: 'user', content: transcript });
  callOpenAI();
});

recognition.addEventListener('end', () => {
  if (recording) recognition.start();
});

function addMessage(sender, text) {
  const p = document.createElement('p');
  p.textContent = `${sender}: ${text}`;
  conversationDiv.appendChild(p);
  conversationDiv.scrollTop = conversationDiv.scrollHeight;
}

async function callOpenAI() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    alert('Please enter your OpenAI API key.');
    return;
  }
  const placeholder = document.createElement('p');
  placeholder.textContent = 'Agent: ...';
  conversationDiv.appendChild(placeholder);
  conversationDiv.scrollTop = conversationDiv.scrollHeight;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + key
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: messages,
      temperature: 0.2
    })
  });

  const data = await response.json();
  const text = data.choices[0].message.content;
  placeholder.textContent = `Agent: ${text}`;
  messages.push({ role: 'assistant', content: text });
  speak(text.replace(/JSON:.*/s, ''));
  const match = text.match(/JSON:\s*(\{.*\})/s);
  if (match) {
    try {
      const obj = JSON.parse(match[1]);
      jsonOutput.textContent = JSON.stringify(obj, null, 2);
    } catch (e) {
      console.error('Failed to parse JSON', e);
    }
  }
}

function speak(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  speechSynthesis.speak(utterance);
}

window.addEventListener('load', () => {
  messages.push({ role: 'user', content: 'Hello' });
  callOpenAI();
});
