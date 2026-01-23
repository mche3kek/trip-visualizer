import React, { useState } from 'react';
import { Activity, ActivityPricing, PriceEntry } from '../types';
import { X, ExternalLink, RefreshCw, Wallet, Edit2, Save, Sparkles } from 'lucide-react';
import { getActivityPricing } from '../services/geminiService';

interface PriceDetailPopupProps {
    activity: Activity;
    city: string;
    onUpdate: (updated: Activity) => void;
    onClose: () => void;
}

export const PriceDetailPopup: React.FC<PriceDetailPopupProps> = ({
    activity,
    city,
    onUpdate,
    onClose
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editPrice, setEditPrice] = useState<string>(
        activity.pricing?.basePrice?.toString() || ''
    );

    const handleFetchPricing = async () => {
        setIsLoading(true);
        const pricing = await getActivityPricing(activity.name, city);
        setIsLoading(false);

        if (pricing) {
            onUpdate({
                ...activity,
                pricing: pricing
            });
        }
    };

    const handleSaveManualPrice = () => {
        const amount = parseInt(editPrice) || 0;
        onUpdate({
            ...activity,
            pricing: {
                ...activity.pricing,
                isFree: amount === 0,
                basePrice: amount,
                lastUpdated: new Date().toISOString()
            }
        });
        setIsEditing(false);
    };

    const pricing = activity.pricing;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-green-50 to-emerald-50">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-green-100 rounded-lg">
                            <Wallet className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800">Pricing Details</h3>
                            <p className="text-xs text-gray-500 truncate max-w-[200px]">{activity.name}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-white/80 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* Main Price Display */}
                    <div className="text-center py-4 bg-gray-50 rounded-xl">
                        {isEditing ? (
                            <div className="flex items-center justify-center gap-2">
                                <span className="text-2xl text-gray-400">¥</span>
                                <input
                                    type="number"
                                    value={editPrice}
                                    onChange={(e) => setEditPrice(e.target.value)}
                                    className="w-32 text-3xl font-bold text-center border-b-2 border-green-500 bg-transparent outline-none"
                                    placeholder="0"
                                    autoFocus
                                />
                                <button
                                    onClick={handleSaveManualPrice}
                                    className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                                >
                                    <Save className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div>
                                <p className="text-4xl font-bold text-green-700">
                                    {pricing?.isFree ? 'Free' : pricing?.basePrice ? `¥${pricing.basePrice.toLocaleString()}` : '¥?'}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                    {pricing?.lastUpdated
                                        ? `Updated ${new Date(pricing.lastUpdated).toLocaleDateString()}`
                                        : 'No pricing data yet'}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Price Tiers */}
                    {pricing?.priceEntries && pricing.priceEntries.length > 0 && (
                        <div className="border rounded-xl overflow-hidden">
                            <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Price Tiers
                            </div>
                            <div className="divide-y">
                                {pricing.priceEntries.map((entry: PriceEntry, idx: number) => (
                                    <div key={idx} className="flex justify-between items-center px-4 py-3">
                                        <span className="text-gray-700">{entry.label}</span>
                                        <span className="font-semibold text-green-700">
                                            {entry.amount === 0 ? 'Free' : `¥${entry.amount.toLocaleString()}`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    {pricing?.priceNotes && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-sm text-amber-800">
                                <span className="font-semibold">💡 Tip:</span> {pricing.priceNotes}
                            </p>
                        </div>
                    )}

                    {/* Official Link */}
                    {pricing?.priceLink && (
                        <a
                            href={pricing.priceLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 py-2"
                        >
                            <ExternalLink className="w-4 h-4" />
                            View Official Pricing
                        </a>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="px-6 py-4 bg-gray-50 flex justify-between gap-2">
                    <button
                        onClick={() => {
                            setEditPrice(pricing?.basePrice?.toString() || '');
                            setIsEditing(!isEditing);
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <Edit2 className="w-4 h-4" />
                        {isEditing ? 'Cancel' : 'Edit Manually'}
                    </button>
                    <button
                        onClick={handleFetchPricing}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                    >
                        {isLoading ? (
                            <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Fetching...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" />
                                Fetch with AI
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
