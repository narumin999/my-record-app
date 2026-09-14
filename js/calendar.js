async function createCalendarEvent(eventData) {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
    });
    const data = await res.json();
    return data.id;
}

async function updateCalendarEvent(eventId, eventData) {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
    });
}

async function deleteCalendarEvent(eventId) {
    if (!eventId) return;
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
}

// ▼ カレンダーの予定にゲストを追加し、招待状を送信する
async function addGuestToCalendarEvent(eventId, emails) {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const event = await res.json();
    
    event.attendees = event.attendees || [];
    let isUpdated = false;
    
    for (let email of emails) {
        if (!event.attendees.find(a => a.email === email)) {
            event.attendees.push({ email: email });
            isUpdated = true;
        }
    }
    
    if (isUpdated) {
        // sendUpdates=all により、ゲストの予定表に自動追加されメール通知が届きます
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
        });
    }
}
