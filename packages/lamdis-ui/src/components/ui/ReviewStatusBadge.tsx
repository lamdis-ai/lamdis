"use client";

import React from "react";
import { FiCheckCircle, FiXCircle, FiAlertTriangle, FiClock, FiEye, FiFlag, FiCheck } from "react-icons/fi";

export type ReviewStatus = 
  | 'pending_review' 
  | 'approved' 
  | 'rejected' 
  | 'needs_investigation' 
  | 'false_positive' 
  | 'acknowledged';

export type TestStatus = 'passed' | 'failed' | 'partial' | 'error';

interface ReviewStatusBadgeProps {
  status: ReviewStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  interactive?: boolean;
  onClick?: () => void;
}

const STATUS_CONFIG: Record<ReviewStatus, { 
  label: string; 
  icon: React.ElementType; 
  className: string;
  description: string;
}> = {
  pending_review: {
    label: 'Pending Review',
    icon: FiClock,
    className: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    description: 'Awaiting review by a team member',
  },
  approved: {
    label: 'Approved',
    icon: FiCheckCircle,
    className: 'bg-green-500/20 text-green-300 border-green-500/30',
    description: 'Result has been reviewed and approved',
  },
  rejected: {
    label: 'Rejected',
    icon: FiXCircle,
    className: 'bg-red-500/20 text-red-300 border-red-500/30',
    description: 'Result has been reviewed and rejected',
  },
  needs_investigation: {
    label: 'Needs Investigation',
    icon: FiAlertTriangle,
    className: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    description: 'Requires further investigation',
  },
  false_positive: {
    label: 'False Positive',
    icon: FiFlag,
    className: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    description: 'Marked as a false positive finding',
  },
  acknowledged: {
    label: 'Acknowledged',
    icon: FiCheck,
    className: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    description: 'Result has been acknowledged',
  },
};

const SIZE_CLASSES = {
  sm: 'text-xs px-1.5 py-0.5 gap-1',
  md: 'text-sm px-2 py-1 gap-1.5',
  lg: 'text-base px-3 py-1.5 gap-2',
};

export function ReviewStatusBadge({ 
  status, 
  size = 'md', 
  showIcon = true, 
  interactive = false,
  onClick 
}: ReviewStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending_review;
  const Icon = config.icon;
  
  const Component = interactive ? 'button' : 'span';
  
  return (
    <Component
      className={`
        inline-flex items-center rounded border font-medium
        ${config.className}
        ${SIZE_CLASSES[size]}
        ${interactive ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
      `}
      onClick={onClick}
      title={config.description}
    >
      {showIcon && <Icon className={size === 'sm' ? 'w-3 h-3' : size === 'md' ? 'w-4 h-4' : 'w-5 h-5'} />}
      {config.label}
    </Component>
  );
}

interface TestStatusBadgeProps {
  status: TestStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

const TEST_STATUS_CONFIG: Record<TestStatus, {
  label: string;
  icon: React.ElementType;
  className: string;
}> = {
  passed: {
    label: 'Passed',
    icon: FiCheckCircle,
    className: 'bg-green-500/20 text-green-300 border-green-500/30',
  },
  failed: {
    label: 'Failed',
    icon: FiXCircle,
    className: 'bg-red-500/20 text-red-300 border-red-500/30',
  },
  partial: {
    label: 'Partial',
    icon: FiAlertTriangle,
    className: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  error: {
    label: 'Error',
    icon: FiXCircle,
    className: 'bg-red-600/20 text-red-400 border-red-600/30',
  },
};

export function TestStatusBadge({ status, size = 'md', showIcon = true }: TestStatusBadgeProps) {
  const config = TEST_STATUS_CONFIG[status] || TEST_STATUS_CONFIG.failed;
  const Icon = config.icon;
  
  return (
    <span className={`inline-flex items-center rounded border font-medium ${config.className} ${SIZE_CLASSES[size]}`}>
      {showIcon && <Icon className={size === 'sm' ? 'w-3 h-3' : size === 'md' ? 'w-4 h-4' : 'w-5 h-5'} />}
      {config.label}
    </span>
  );
}

export { STATUS_CONFIG as REVIEW_STATUS_CONFIG, TEST_STATUS_CONFIG };