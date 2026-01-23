import React, { useState } from 'react';
import { Activity } from '../types';
import { Clock, MapPin, Sparkles, Trash2, ArrowUp, ArrowDown, Edit2, Save, Link as LinkIcon, Image as ImageIcon, Wand2, GripVertical, ListChecks, HelpCircle, ChevronDown, ChevronUp, RefreshCw, Split, Lock, Unlock, Timer, Wallet } from 'lucide-react';
import { getTravelRecommendation, generateSubActivities, analyzePlaceName } from '../services/geminiService';
import { searchGooglePlace } from '../services/mapService';
import { PriceDetailPopup } from './PriceDetailPopup';

interface ActivityCardProps {
  activity: Activity;
  city: string;
  onUpdate: (updated: Activity) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSplit?: (original: Activity, newNames: string[]) => void;
  onFocus?: () => void;
  isFirst: boolean;
  isLast: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export const ActivityCard: React.FC<ActivityCardProps> = ({
  activity,
  city,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onSplit,
  onFocus,
  isFirst,
  isLast,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedActivity, setEditedActivity] = useState(activity);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [isLoadingImg, setIsLoadingImg] = useState(false);
  const [isLoadingSub, setIsLoadingSub] = useState(false);
  const [isSyncingMap, setIsSyncingMap] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [showSubSpots, setShowSubSpots] = useState(false);
  const [showTimeReason, setShowTimeReason] = useState(false);
  const [isEditingDuration, setIsEditingDuration] = useState(false);
  const [durationInput, setDurationInput] = useState('');
  const [isAutoFetchingImage, setIsAutoFetchingImage] = useState(false);
  const [showPricePopup, setShowPricePopup] = useState(false);

  // Auto-fetch image when it fails or is missing
  React.useEffect(() => {
    let isCancelled = false;

    const autoFetchImage = async () => {
      // Only try if: no image URL OR image errored, and not already fetching
      const needsImage = imgError || !activity.imageUrl;
      if (needsImage && !isAutoFetchingImage && !isLoadingImg) {
        setIsAutoFetchingImage(true);
        try {
          const place = await searchGooglePlace(`${activity.name} ${city}`, activity.name);
          if (!isCancelled && place && place.photoUrl) {
            onUpdate({
              ...activity,
              imageUrl: place.photoUrl,
              googlePlaceId: place.placeId || activity.googlePlaceId,
              location: place.location || activity.location
            });
            setImgError(false);
          }
        } catch (e) {
          console.error('Auto-fetch image failed:', e);
        }
        if (!isCancelled) {
          setIsAutoFetchingImage(false);
        }
      }
    };

    // Small delay to avoid spamming on mount
    const timer = setTimeout(autoFetchImage, 300);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [imgError, activity.imageUrl, activity.name, city]); // Re-run if name changes or image errors

  // Generate fallback placeholder seed
  const imageId = activity.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 1000;
  // User requested NO picsum placeholders. Only Google Photos.
  const displayImage = !imgError && activity.imageUrl ? activity.imageUrl : null;

  const handleAiAsk = async () => {
    setIsLoadingAi(true);
    const rec = await getTravelRecommendation(editedActivity.name, city);
    setIsLoadingAi(false);

    if (rec) {
      let newEndTime = editedActivity.endTime;

      const hourMatch = rec.duration.match(/(\d+(\.\d+)?)\s*hour/i);
      const minMatch = rec.duration.match(/(\d+)\s*min/i);

      if (hourMatch || minMatch) {
        const [startH, startM] = editedActivity.startTime.split(':').map(Number);
        let durationMinutes = 0;

        if (hourMatch) durationMinutes += parseFloat(hourMatch[1]) * 60;
        else if (minMatch) durationMinutes += parseInt(minMatch[1]);

        const startDate = new Date();
        startDate.setHours(startH, startM);
        const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

        newEndTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
      }

      setEditedActivity(prev => ({
        ...prev,
        description: rec.description,
        location: rec.coordinates,
        endTime: newEndTime,
        durationReasoning: rec.reasoning
      }));

      alert(`AI Suggestion Applied:\nDuration: ${rec.duration}\nReason: ${rec.reasoning}`);
    }
  };

  const handleGenerateSubSpots = async () => {
    if (activity.subActivities && activity.subActivities.length > 0) return;
    setIsLoadingSub(true);
    const spots = await generateSubActivities(activity.name, city);
    setIsLoadingSub(false);
    if (spots.length > 0) {
      onUpdate({ ...activity, subActivities: spots });
    }
  };

  const handleMapSync = async () => {
    setIsSyncingMap(true);
    // 1. Check if name needs splitting
    const analysis = await analyzePlaceName(activity.name, city);

    if (analysis?.action === 'split' && onSplit) {
      const splitNames = analysis.data as string[];
      const confirmSplit = window.confirm(`Suggestion: "${activity.name}" seems to contain multiple places (${splitNames.join(', ')}). Split them?`);
      if (confirmSplit) {
        onSplit(activity, splitNames);
        setIsSyncingMap(false);
        return;
      }
    }

    // 2. Fetch official Google Place details
    const place = await searchGooglePlace(`${analysis?.action === 'rename' ? analysis.data : activity.name} ${city}`, activity.name);

    if (place) {
      onUpdate({
        ...activity,
        name: place.name,
        location: place.location,
        imageUrl: place.photoUrl || activity.imageUrl,
        googlePlaceId: place.placeId
      });
      setImgError(false);
    } else {
      alert("Could not find place in Google Maps. Try editing the name.");
    }
    setIsSyncingMap(false);
  };

  const handleFetchImage = async () => {
    setIsLoadingImg(true);
    const place = await searchGooglePlace(`${editedActivity.name} ${city}`, editedActivity.name);
    setIsLoadingImg(false);
    if (place && place.photoUrl) {
      setEditedActivity(prev => ({ ...prev, imageUrl: place.photoUrl, location: place.location }));
      setImgError(false);
    } else {
      alert("Could not find a suitable image from Google Places.");
    }
  };

  const handleRetryImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoadingImg(true);

    // Force a fresh search, maybe with slightly different query if needed, but standard should work
    const place = await searchGooglePlace(`${activity.name} ${city}`, activity.name);
    setIsLoadingImg(false);

    if (place && place.photoUrl) {
      onUpdate({
        ...activity,
        name: place.name, // Sync name too just in case
        imageUrl: place.photoUrl,
        googlePlaceId: place.placeId,
        location: place.location
      });
      setImgError(false);
    } else {
      // If failed, maybe try just the name without city as fallback
      const fallback = await searchGooglePlace(activity.name, "Japan");

      if (fallback && fallback.photoUrl) {
        onUpdate({
          ...activity,
          imageUrl: fallback.photoUrl
        });
        setImgError(false);
      } else {
        alert("Could not recover image. Try editing the name manually.");
      }
    }
  };

  const saveChanges = () => {
    onUpdate(editedActivity);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-4 mb-4 border-l-4 border-indigo-500">
        <div className="space-y-3">
          <input
            type="text"
            value={editedActivity.name}
            onChange={(e) => setEditedActivity({ ...editedActivity, name: e.target.value })}
            className="w-full text-lg font-bold border-b border-gray-200 focus:outline-none focus:border-indigo-500"
            placeholder="Activity Name"
          />

          <div className="flex gap-2 items-center">
            <Clock className="w-4 h-4 text-gray-400" />
            <input
              type="time"
              value={editedActivity.startTime}
              onChange={(e) => setEditedActivity({ ...editedActivity, startTime: e.target.value })}
              className="border p-1 rounded text-sm"
            />
            <span className="text-gray-400">-</span>
            <input
              type="time"
              value={editedActivity.endTime}
              onChange={(e) => setEditedActivity({ ...editedActivity, endTime: e.target.value })}
              className="border p-1 rounded text-sm"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1 flex items-center border rounded px-2 relative">
              <ImageIcon className="w-4 h-4 text-gray-400 mr-2" />
              <input
                type="text"
                placeholder="Image URL"
                value={editedActivity.imageUrl || ''}
                onChange={(e) => {
                  setEditedActivity({ ...editedActivity, imageUrl: e.target.value });
                  setImgError(false);
                }}
                className="w-full p-1 text-sm outline-none pr-8"
              />
              <button
                onClick={handleFetchImage}
                disabled={isLoadingImg}
                className="absolute right-1 top-1 bottom-1 text-blue-500 hover:bg-blue-50 rounded p-1"
                title="Find image with Google"
              >
                {isLoadingImg ? <span className="animate-spin">⌛</span> : <Wand2 className="w-3 h-3" />}
              </button>
            </div>
            <div className="flex-1 flex items-center border rounded px-2">
              <LinkIcon className="w-4 h-4 text-gray-400 mr-2" />
              <input
                type="text"
                placeholder="Link URL"
                value={editedActivity.link || ''}
                onChange={(e) => setEditedActivity({ ...editedActivity, link: e.target.value })}
                className="w-full p-1 text-sm outline-none"
              />
            </div>
          </div>

          <textarea
            value={editedActivity.description}
            onChange={(e) => setEditedActivity({ ...editedActivity, description: e.target.value })}
            className="w-full border p-2 rounded text-sm text-gray-600 h-20 resize-none"
            placeholder="Description"
          />

          <div className="flex justify-between items-center mt-2 pt-2 border-t">
            <button
              onClick={handleAiAsk}
              disabled={isLoadingAi}
              className="flex items-center text-xs font-medium text-purple-600 hover:text-purple-800 bg-purple-50 px-2 py-1 rounded transition-colors"
            >
              <Sparkles className="w-3 h-3 mr-1" />
              {isLoadingAi ? 'Optimizing...' : 'AI Auto-Schedule'}
            </button>
            <div className="space-x-2">
              <button onClick={() => setIsEditing(false)} className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button onClick={saveChanges} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm flex items-center shadow-sm">
                <Save className="w-3 h-3 mr-1" /> Save
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group relative flex flex-col sm:flex-row bg-white rounded-xl shadow-sm hover:shadow-md transition-all mb-4 overflow-hidden border border-gray-100 ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Duration Explanation Bubble */}
      {showTimeReason && (
        <div className="absolute top-12 right-4 z-50 bg-gray-900 text-white text-xs p-3 rounded-lg shadow-xl max-w-xs animate-in fade-in zoom-in-95 duration-200">
          <button
            onClick={(e) => { e.stopPropagation(); setShowTimeReason(false); }}
            className="absolute -top-2 -right-2 w-5 h-5 bg-white text-gray-600 rounded-full shadow-md flex items-center justify-center hover:bg-red-100 hover:text-red-600 transition-colors"
            title="Close"
          >
            ×
          </button>
          <div className="font-bold mb-1 flex items-center"><Clock className="w-3 h-3 mr-1" /> Duration Insight</div>
          {activity.durationReasoning || "Standard duration based on typical visits."}
          <div className="absolute -top-1 right-4 w-2 h-2 bg-gray-900 transform rotate-45"></div>
        </div>
      )}

      <div
        className="h-48 sm:h-auto sm:w-40 bg-gray-100 flex-shrink-0 relative overflow-hidden group-hover:opacity-95 transition-opacity cursor-pointer"
        onClick={onFocus}
        title="Show on map"
      >
        {displayImage ? (
          <img
            src={displayImage}
            alt={activity.name}
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 text-gray-400">
            {isAutoFetchingImage || isLoadingImg ? (
              <>
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-400 mb-2" />
                <span className="text-[10px] text-indigo-500">Loading image...</span>
              </>
            ) : (
              <ImageIcon className="w-8 h-8 opacity-20" />
            )}
          </div>
        )}
        {activity.link && (
          <a href={activity.link} target="_blank" rel="noreferrer" className="absolute bottom-1 right-1 bg-white/80 p-1.5 rounded-full text-indigo-600 hover:bg-white shadow-sm z-10" onClick={e => e.stopPropagation()}>
            <LinkIcon className="w-3.5 h-3.5" />
          </a>
        )}
        {draggable && (
          <div className="absolute top-2 left-2 bg-black/20 p-1 rounded text-white backdrop-blur-sm sm:hidden">
            <GripVertical className="w-4 h-4" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center">
          <MapPin className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-md transition-opacity" />
        </div>
      </div>

      <div className="flex-1 p-4 flex flex-col justify-between min-h-[8rem]">
        <div>
          <div className="flex justify-between items-start">
            <h4 className="font-bold text-gray-800 leading-tight pr-12 text-lg flex items-center gap-2">
              {draggable && <GripVertical className="w-4 h-4 text-gray-300 hidden sm:block" />}
              {activity.name}
              {activity.googlePlaceId && <div className="text-[10px] bg-green-100 text-green-700 px-1 rounded border border-green-200" title="Verified Google Place">✓ Maps</div>}
            </h4>

            <div className="absolute top-2 right-2 flex bg-white/90 backdrop-blur rounded-lg shadow-sm border border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <button
                onClick={handleMapSync}
                disabled={isSyncingMap}
                className="p-1.5 hover:bg-green-50 text-green-600"
                title="Sync with Google Maps / Fix Name"
              >
                {isSyncingMap ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => onMoveUp()} disabled={isFirst} className="p-1.5 hover:bg-gray-100 text-gray-500 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => onMoveDown()} disabled={isLast} className="p-1.5 hover:bg-gray-100 text-gray-500 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
              <div className="w-px bg-gray-200 my-1"></div>
              <button onClick={() => setIsEditing(true)} className="p-1.5 hover:bg-blue-50 text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
              <button onClick={onDelete} className="p-1.5 hover:bg-red-50 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-2 line-clamp-3 leading-relaxed">{activity.description}</p>

          {/* Sub-spots Section */}
          {showSubSpots && (
            <div className="mt-3 bg-gray-50 rounded-lg p-3 border border-gray-200 animate-in slide-in-from-top-2 duration-200">
              <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center">
                <ListChecks className="w-3.5 h-3.5 mr-1.5" /> Highlights & Sub-spots
              </h5>
              {activity.subActivities && activity.subActivities.length > 0 ? (
                <ul className="space-y-1">
                  {activity.subActivities.map((sub, i) => (
                    <li key={i} className="text-sm text-gray-700 flex items-start">
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                      {sub}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center py-2">
                  <p className="text-xs text-gray-400 mb-2">No details yet.</p>
                  <button
                    onClick={handleGenerateSubSpots}
                    disabled={isLoadingSub}
                    className="text-xs bg-white border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-full hover:bg-indigo-50 transition-colors shadow-sm"
                  >
                    {isLoadingSub ? 'Generating...' : '✨ Generate Sub-spots with AI'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 flex-wrap">
            {/* Time Lock Button */}
            <button
              onClick={() => onUpdate({ ...activity, lockedStartTime: !activity.lockedStartTime })}
              className={`flex items-center px-2.5 py-1 rounded-md transition-colors relative ${activity.lockedStartTime ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
              title={activity.lockedStartTime ? "Start Time Locked (Anchor)" : "Start Time Unlocked (Auto-Flows)"}
            >
              {activity.lockedStartTime ? <Lock className="w-3.5 h-3.5 mr-1.5" /> : <Unlock className="w-3.5 h-3.5 mr-1.5 opacity-50" />}
              {activity.startTime} - {activity.endTime}
              {activity.lockedStartTime && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider">Locked</span>}
            </button>

            {/* Duration Lock Button */}
            {isEditingDuration ? (
              <div className="flex items-center gap-1 bg-green-50 border border-green-200 rounded-md px-2 py-1">
                <Timer className="w-3.5 h-3.5 text-green-600" />
                <input
                  type="number"
                  value={durationInput}
                  onChange={(e) => setDurationInput(e.target.value)}
                  placeholder="mins"
                  className="w-12 text-xs border-none bg-transparent outline-none text-green-700"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const mins = parseInt(durationInput);
                      if (mins > 0) {
                        onUpdate({ ...activity, lockedDurationMinutes: mins });
                      }
                      setIsEditingDuration(false);
                      setDurationInput('');
                    } else if (e.key === 'Escape') {
                      setIsEditingDuration(false);
                      setDurationInput('');
                    }
                  }}
                  onBlur={() => {
                    const mins = parseInt(durationInput);
                    if (mins > 0) {
                      onUpdate({ ...activity, lockedDurationMinutes: mins });
                    }
                    setIsEditingDuration(false);
                    setDurationInput('');
                  }}
                />
                <span className="text-[10px] text-green-600">min</span>
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDurationInput(activity.lockedDurationMinutes?.toString() || '');
                  setIsEditingDuration(true);
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${activity.lockedDurationMinutes ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                title={activity.lockedDurationMinutes ? `Duration locked: ${activity.lockedDurationMinutes} min (click to edit)` : "Lock duration (click to set)"}
              >
                <Timer className="w-3.5 h-3.5" />
                {activity.lockedDurationMinutes ? (
                  <span className="text-[10px] font-bold">{activity.lockedDurationMinutes}m</span>
                ) : (
                  <span className="text-[10px] opacity-50">Set</span>
                )}
              </button>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); setShowTimeReason(!showTimeReason); }}
              className={`p-1 rounded-full bg-gray-100 hover:bg-indigo-100 text-gray-400 hover:text-indigo-500 transition-colors ${!activity.durationReasoning ? 'opacity-0 pointer-events-none' : ''}`}
              title="Why this duration?"
            >
              <HelpCircle className="w-3 h-3" />
            </button>
            {activity.location && (
              <div className="flex items-center px-2 py-1 hidden sm:flex" title="Coordinates available">
                <MapPin className="w-3.5 h-3.5 mr-1.5 text-green-600" />
                <span>Mapped</span>
              </div>
            )}
            <div className="px-2 py-1 bg-gray-100 rounded text-gray-600 capitalize">
              {activity.type}
            </div>
            {/* Price Badge */}
            <button
              onClick={(e) => { e.stopPropagation(); setShowPricePopup(true); }}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${activity.pricing?.isFree
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : activity.pricing?.basePrice
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
              title="View/Edit pricing"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold">
                {activity.pricing?.isFree
                  ? 'Free'
                  : activity.pricing?.basePrice
                    ? `¥${activity.pricing.basePrice.toLocaleString()}`
                    : '¥?'
                }
              </span>
            </button>
          </div>

          <button
            onClick={() => setShowSubSpots(!showSubSpots)}
            className="flex items-center text-xs font-medium text-gray-500 hover:text-indigo-600 transition-colors px-2 py-1"
          >
            {showSubSpots ? 'Hide Details' : 'View Sub-spots'}
            {showSubSpots ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
          </button>
        </div>
      </div>

      {/* Price Detail Popup */}
      {showPricePopup && (
        <PriceDetailPopup
          activity={activity}
          city={city}
          onUpdate={onUpdate}
          onClose={() => setShowPricePopup(false)}
        />
      )}
    </div>
  );
};