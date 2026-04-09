"use client";

import React, { useState, useEffect } from "react";
import { 
  FiMessageSquare, 
  FiClock, 
  FiUser, 
  FiSend, 
  FiEdit2, 
  FiTrash2, 
  FiChevronDown,
  FiRotateCcw,
  FiX
} from "react-icons/fi";
import { ReviewStatusBadge, type ReviewStatus, REVIEW_STATUS_CONFIG } from "./ReviewStatusBadge";

// Types
export interface Comment {
  _id: string;
  text: string;
  authorSub: string;
  authorEmail?: string;
  authorName?: string;
  createdAt: string;
  updatedAt?: string;
  edited?: boolean;
}

export interface StatusHistoryEntry {
  previousStatus?: string;
  newStatus: string;
  changedBy: string;
  changedByEmail?: string;
  changedByName?: string;
  reason?: string;
  changedAt: string;
}

interface ReviewPanelProps {
  resultId: string;
  currentStatus: ReviewStatus;
  testStatus: 'passed' | 'failed' | 'partial' | 'error';
  comments?: Comment[];
  statusHistory?: StatusHistoryEntry[];
  currentUserSub?: string;
  onStatusChange: (newStatus: ReviewStatus, reason?: string) => Promise<void>;
  onAddComment: (text: string) => Promise<void>;
  onEditComment?: (commentId: string, text: string) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<void>;
  className?: string;
}

// Status Selector Component
function StatusSelector({ 
  currentStatus, 
  onStatusChange,
  disabled = false,
}: { 
  currentStatus: ReviewStatus; 
  onStatusChange: (status: ReviewStatus, reason?: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ReviewStatus | null>(null);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const statuses: ReviewStatus[] = [
    'pending_review',
    'approved',
    'rejected',
    'needs_investigation',
    'false_positive',
    'acknowledged',
  ];
  
  const handleSelect = async () => {
    if (!selectedStatus || selectedStatus === currentStatus) return;
    setIsSubmitting(true);
    try {
      await onStatusChange(selectedStatus, reason || undefined);
      setIsOpen(false);
      setSelectedStatus(null);
      setReason("");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-600 
          hover:border-slate-500 transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <ReviewStatusBadge status={currentStatus} size="sm" />
        <FiChevronDown className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="absolute z-50 mt-2 right-0 w-80 bg-slate-800 border border-slate-700 rounded-lg shadow-xl">
          <div className="p-3 border-b border-slate-700">
            <h4 className="text-sm font-medium text-slate-200">Change Review Status</h4>
          </div>
          
          <div className="p-2 max-h-64 overflow-y-auto">
            {statuses.map((status) => (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                className={`
                  w-full flex items-center gap-2 p-2 rounded transition-colors
                  ${selectedStatus === status ? 'bg-slate-700' : 'hover:bg-slate-700/50'}
                  ${currentStatus === status ? 'opacity-50' : ''}
                `}
                disabled={currentStatus === status}
              >
                <ReviewStatusBadge status={status} size="sm" />
                <span className="text-xs text-slate-400 ml-auto">
                  {REVIEW_STATUS_CONFIG[status]?.description}
                </span>
              </button>
            ))}
          </div>
          
          {selectedStatus && selectedStatus !== currentStatus && (
            <div className="p-3 border-t border-slate-700 space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Reason (optional)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Add a reason for this status change..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-slate-100 placeholder-slate-500 resize-none"
                  rows={2}
                />
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => { setIsOpen(false); setSelectedStatus(null); setReason(""); }}
                  className="flex-1 px-3 py-1.5 text-sm text-slate-300 border border-slate-600 rounded hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSelect}
                  disabled={isSubmitting}
                  className="flex-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Update Status'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Comment Item Component
function CommentItem({
  comment,
  isOwner,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  isOwner: boolean;
  onEdit?: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  
  const handleSaveEdit = () => {
    if (editText.trim() && onEdit) {
      onEdit(comment._id, editText.trim());
      setIsEditing(false);
    }
  };
  
  return (
    <div className="p-3 bg-slate-800/50 rounded-lg">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center">
            <FiUser className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <span className="text-sm font-medium text-slate-200">
              {comment.authorName || comment.authorEmail || 'Unknown User'}
            </span>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <FiClock className="w-3 h-3" />
              {new Date(comment.createdAt).toLocaleString()}
              {comment.edited && <span>(edited)</span>}
            </div>
          </div>
        </div>
        
        {isOwner && !isEditing && (
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-1 text-slate-400 hover:text-slate-200"
                title="Edit"
              >
                <FiEdit2 className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(comment._id)}
                className="p-1 text-slate-400 hover:text-red-400"
                title="Delete"
              >
                <FiTrash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-slate-100 resize-none"
            rows={3}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setIsEditing(false); setEditText(comment.text); }}
              className="px-2 py-1 text-xs text-slate-300 border border-slate-600 rounded hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-500"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-300 whitespace-pre-wrap">{comment.text}</p>
      )}
    </div>
  );
}

// Status History Item
function HistoryItem({ entry }: { entry: StatusHistoryEntry }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="w-2 h-2 rounded-full bg-slate-500 mt-2" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {entry.previousStatus && (
            <>
              <ReviewStatusBadge status={entry.previousStatus as ReviewStatus} size="sm" />
              <span className="text-slate-500">→</span>
            </>
          )}
          <ReviewStatusBadge status={entry.newStatus as ReviewStatus} size="sm" />
        </div>
        <div className="text-xs text-slate-500 mt-1">
          by {entry.changedByName || entry.changedByEmail || entry.changedBy} • {new Date(entry.changedAt).toLocaleString()}
        </div>
        {entry.reason && (
          <div className="text-xs text-slate-400 mt-1 italic">"{entry.reason}"</div>
        )}
      </div>
    </div>
  );
}

// Main ReviewPanel Component
export function ReviewPanel({
  resultId,
  currentStatus,
  testStatus,
  comments = [],
  statusHistory = [],
  currentUserSub,
  onStatusChange,
  onAddComment,
  onEditComment,
  onDeleteComment,
  className = "",
}: ReviewPanelProps) {
  const [activeTab, setActiveTab] = useState<'comments' | 'history'>('comments');
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setIsSubmitting(true);
    try {
      await onAddComment(newComment.trim());
      setNewComment("");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleStatusChange = async (newStatus: ReviewStatus, reason?: string) => {
    await onStatusChange(newStatus, reason);
  };
  
  return (
    <div className={`border border-slate-700 rounded-xl bg-slate-900/50 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-200">Review & Discussion</h3>
        <StatusSelector 
          currentStatus={currentStatus}
          onStatusChange={handleStatusChange}
        />
      </div>
      
      {/* Tabs */}
      <div className="flex border-b border-slate-700">
        <button
          onClick={() => setActiveTab('comments')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'comments' 
              ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800/50' 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiMessageSquare className="w-4 h-4" />
          Comments ({comments.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'history' 
              ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800/50' 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiRotateCcw className="w-4 h-4" />
          History ({statusHistory.length})
        </button>
      </div>
      
      {/* Content */}
      <div className="p-4">
        {activeTab === 'comments' ? (
          <div className="space-y-4">
            {/* Add Comment */}
            <div className="space-y-2">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-slate-100 placeholder-slate-500 resize-none focus:border-indigo-500 focus:outline-none"
                rows={3}
              />
              <div className="flex justify-end">
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || isSubmitting}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <FiSend className="w-4 h-4" />
                  {isSubmitting ? 'Posting...' : 'Post Comment'}
                </button>
              </div>
            </div>
            
            {/* Comments List */}
            {comments.length > 0 ? (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <CommentItem
                    key={comment._id}
                    comment={comment}
                    isOwner={currentUserSub === comment.authorSub}
                    onEdit={onEditComment}
                    onDelete={onDeleteComment}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <FiMessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No comments yet</p>
              </div>
            )}
          </div>
        ) : (
          <div>
            {statusHistory.length > 0 ? (
              <div className="divide-y divide-slate-700/50">
                {statusHistory.slice().reverse().map((entry, index) => (
                  <HistoryItem key={index} entry={entry} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <FiRotateCcw className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No status changes yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReviewPanel;