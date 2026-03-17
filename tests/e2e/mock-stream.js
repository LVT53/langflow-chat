exports.setupStreamMock = async (page) => {
  await page.route('**/api/chat/stream', async route => {
    // Send a mocked SSE response containing the code block
    const mockContent = 'Here is the code you requested:\n\n```python\ndef test_horizontal_scroll_with_a_very_long_line_of_code_that_should_wrap_or_scroll_horizontally():\n    return "This string is exceptionally long and will definitely trigger horizontal scrolling on a small screen like the iPhone SE"\n```\n';
    
    // We have to mock the SSE stream. SvelteKit uses fetch to read it.
    // However, it might be simpler to just evaluate JS to insert a message into the DOM
    // if the stream mock is too complex.
    // Or we can fulfill with a simple text response if the frontend doesn't strictly check format.
    // Actually, SvelteKit uses `eventsource-parser`, which expects standard SSE events.
  });
}
