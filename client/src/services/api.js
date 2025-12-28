import { getApiUrl } from '@/lib/capacitorAuth';

// Get session token from localStorage (fallback for iOS WKWebView cookie issues)
function getAuthHeaders() {
  const sessionToken = localStorage.getItem('sessionToken') || localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }
  return headers;
}

// Chat with AI Coach
export async function sendChatMessage(userId, message) {
  try {
    const response = await fetch(getApiUrl('/api/ai/chat/message'), {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ userId, message })
    });
    
    if (!response.ok) throw new Error('Failed to send message');
    return await response.json();
  } catch (error) {
    console.error('Chat API error:', error);
    throw error;
  }
}

// Get chat history (default 20 for fast initial load, scroll up for more)
// Supports cursor-based pagination using `before` timestamp
export async function getChatHistory(userId, limit = 20, beforeTimestamp = null) {
  try {
    let url = getApiUrl(`/api/ai/chat/history/${userId}?limit=${limit}`);
    if (beforeTimestamp) {
      url += `&before=${encodeURIComponent(beforeTimestamp)}`;
    }
    console.log('[API] getChatHistory URL:', url, 'before:', beforeTimestamp || 'none');
    const response = await fetch(url, {
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Failed to get history');
    return await response.json();
  } catch (error) {
    console.error('History API error:', error);
    return { messages: [], hasMore: false };
  }
}

// Get user context/profile
export async function getUserProfile(userId) {
  try {
    const response = await fetch(getApiUrl(`/api/ai/user/${userId}/context`), {
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Failed to get profile');
    return await response.json();
  } catch (error) {
    console.error('Profile API error:', error);
    return null;
  }
}

// Update user profile
export async function updateUserProfile(userId, updates) {
  try {
    const response = await fetch(getApiUrl(`/api/ai/user/${userId}/profile`), {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(updates)
    });
    
    if (!response.ok) throw new Error('Failed to update profile');
    return await response.json();
  } catch (error) {
    console.error('Update profile API error:', error);
    throw error;
  }
}

// Get saved videos
export async function getSavedVideos(userId) {
  try {
    const response = await fetch(getApiUrl(`/api/ai/saved-videos/${userId}`), {
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Failed to get saved videos');
    return await response.json();
  } catch (error) {
    console.error('Saved videos API error:', error);
    return { videos: [] };
  }
}

// Save a video
export async function saveVideo(userId, videoId, note = '') {
  try {
    const response = await fetch(getApiUrl('/api/ai/saved-videos'), {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ userId, videoId, note })
    });
    
    if (!response.ok) throw new Error('Failed to save video');
    return await response.json();
  } catch (error) {
    console.error('Save video API error:', error);
    throw error;
  }
}

// Unsave a video
export async function unsaveVideo(userId, videoId) {
  try {
    const response = await fetch(getApiUrl(`/api/ai/saved-videos/${videoId}`), {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ userId })
    });
    
    if (!response.ok) throw new Error('Failed to unsave video');
    return await response.json();
  } catch (error) {
    console.error('Unsave video API error:', error);
    throw error;
  }
}

// Record user feedback signal
export async function recordFeedback(userId, videoId, signalType, signalValue) {
  try {
    const response = await fetch(getApiUrl('/api/ai/feedback'), {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ userId, videoId, signalType, signalValue })
    });
    
    if (!response.ok) throw new Error('Failed to record feedback');
    return await response.json();
  } catch (error) {
    console.error('Feedback API error:', error);
    return null;
  }
}

// Get enhanced recommendation
export async function getRecommendation(userId) {
  try {
    const response = await fetch(getApiUrl(`/api/ai/recommend/${userId}`), {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Failed to get recommendation');
    return await response.json();
  } catch (error) {
    console.error('Recommendation API error:', error);
    return null;
  }
}
