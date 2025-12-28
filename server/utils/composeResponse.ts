import { ProfessorOSResponse } from '../types/professorOSResponse';

export function composeNaturalResponse(
  structured: ProfessorOSResponse,
  userProfile?: any
): string {
  const parts: string[] = [];
  
  // Guard against missing required fields
  if (!structured.mainResponse || !structured.returnLoop) {
    throw new Error('Cannot compose response: missing required fields (mainResponse or returnLoop)');
  }
  
  if (structured.patternObservation) {
    parts.push(structured.patternObservation);
  }
  
  if (structured.anticipatoryDiagnosis) {
    parts.push(structured.anticipatoryDiagnosis);
  }
  
  parts.push(structured.mainResponse);
  
  if (structured.videoRecommendation) {
    const video = structured.videoRecommendation;
    if (video.title && video.instructor && video.startTime && video.reason) {
      parts.push(
        `[VIDEO: ${video.title} by ${video.instructor} | START: ${video.startTime}]\n\n${video.reason}`
      );
    }
  }
  
  parts.push(structured.returnLoop);
  
  if (structured.followUpQuestion) {
    const lastPart = parts[parts.length - 1];
    parts[parts.length - 1] = `${lastPart} ${structured.followUpQuestion}`;
  }
  
  // REMOVED: trialUrgency should NOT appear in coaching responses
  // Trial countdown belongs in UI elements only (header, settings page)
  // if (structured.trialUrgency) {
  //   parts.push(`(${structured.trialUrgency})`);
  // }
  
  return parts.join('\n\n').trim();
}
