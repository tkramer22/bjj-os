interface YouTubeVideo {
  title: string;
  channel: string;
  videoId: string;
  thumbnail: string;
  url: string;
}

interface YouTubeSearchResponse {
  items: Array<{
    id: {
      videoId: string;
    };
    snippet: {
      title: string;
      channelTitle: string;
      thumbnails: {
        high: {
          url: string;
        };
      };
    };
  }>;
}

export async function searchYouTubeVideos(
  technique: string,
  instructor?: string
): Promise<YouTubeVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  if (!apiKey) {
    console.error('YOUTUBE_API_KEY not found in environment variables');
    return [];
  }

  try {
    // Build search query - prioritize instructor if provided
    let searchQuery = technique;
    if (instructor) {
      searchQuery = `${technique} ${instructor}`;
    }

    // YouTube Data API v3 search endpoint
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.append('part', 'snippet');
    url.searchParams.append('q', searchQuery);
    url.searchParams.append('type', 'video');
    url.searchParams.append('maxResults', '3');
    url.searchParams.append('order', 'relevance');
    url.searchParams.append('key', apiKey);

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('YouTube API error:', errorData);
      return [];
    }

    const data: YouTubeSearchResponse = await response.json();

    // Map results to our simplified format
    const videos: YouTubeVideo[] = data.items.map((item) => ({
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      videoId: item.id.videoId,
      thumbnail: item.snippet.thumbnails.high.url,
      url: `https://youtube.com/watch?v=${item.id.videoId}`,
    }));

    return videos;
  } catch (error: any) {
    console.error('Error searching YouTube videos:', error.message);
    return [];
  }
}
