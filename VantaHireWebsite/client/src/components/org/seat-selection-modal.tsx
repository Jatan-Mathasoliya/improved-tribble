import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Crown,
  Shield,
  User,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Member {
  id: number;
  userId: number;
  role: 'owner' | 'admin' | 'member';
  seatAssigned: boolean;
  lastActivityAt: string | null;
  user: {
    firstName: string | null;
    lastName: string | null;
    username: string;
  };
}

interface SeatSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  targetSeats: number;
  onConfirm: (selectedMemberIds: number[]) => Promise<void>;
  title?: string;
  description?: string;
}

function getRoleIcon(role: string) {
  switch (role) {
    case 'owner':
      return <Crown className="h-4 w-4 text-amber-500" />;
    case 'admin':
      return <Shield className="h-4 w-4 text-blue-500" />;
    default:
      return <User className="h-4 w-4 text-slate-400" />;
  }
}

function getRoleBadge(role: string) {
  switch (role) {
    case 'owner':
      return <Badge variant="default" className="bg-amber-500 text-xs">Owner</Badge>;
    case 'admin':
      return <Badge variant="default" className="bg-blue-500 text-xs">Admin</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs">Member</Badge>;
  }
}

export function SeatSelectionModal({
  open,
  onOpenChange,
  members,
  targetSeats,
  onConfirm,
  title = "Select Members to Keep",
  description,
}: SeatSelectionModalProps) {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sort members: owner first, then by last activity
  const sortedMembers = [...members].sort((a, b) => {
    // Owner always first
    if (a.role === 'owner') return -1;
    if (b.role === 'owner') return 1;

    // Then by last activity (most recent first)
    const aActivity = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const bActivity = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return bActivity - aActivity;
  });

  // Find owner ID
  const owner = members.find(m => m.role === 'owner');
  const ownerId = owner?.id;

  // Initialize selection when modal opens
  useEffect(() => {
    if (open) {
      // Auto-select owner + most recently active members up to targetSeats
      const initialSelection = new Set<number>();
      
      for (let i = 0; i < Math.min(targetSeats, sortedMembers.length); i++) {
        const member = sortedMembers[i];
        if (member) {
          initialSelection.add(member.id);
        }
      }
      
      setSelectedIds(initialSelection);
    }
  }, [open, members, targetSeats]);

  const toggleMember = (memberId: number) => {
    // Cannot unselect owner
    if (memberId === ownerId) return;

    const newSelected = new Set(selectedIds);
    
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId);
    } else {
      // Don't allow selecting more than target seats
      if (newSelected.size >= targetSeats) {
        toast({
          title: "Seat limit reached",
          description: `You can only keep ${targetSeats} seats. Unselect another member first.`,
          variant: "destructive",
        });
        return;
      }
      newSelected.add(memberId);
    }
    
    setSelectedIds(newSelected);
  };

  const handleConfirm = async () => {
    if (selectedIds.size !== targetSeats) {
      toast({
        title: "Selection required",
        description: `Please select exactly ${targetSeats} members to keep.`,
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(Array.from(selectedIds));
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update seats",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const membersToLoseSeat = members.filter(m => !selectedIds.has(m.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description || `Select ${targetSeats} member${targetSeats !== 1 ? 's' : ''} to keep their seats. The owner always keeps their seat.`}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} of {targetSeats} seats selected
            </span>
            <Badge variant={selectedIds.size === targetSeats ? "default" : "secondary"}>
              {selectedIds.size === targetSeats ? "Ready" : `${targetSeats - selectedIds.size} more needed`}
            </Badge>
          </div>

          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
              {sortedMembers.map((member) => {
                const isOwner = member.role === 'owner';
                const isSelected = selectedIds.has(member.id);
                const displayName = [member.user.firstName, member.user.lastName]
                  .filter(Boolean)
                  .join(' ') || member.user.username;

                return (
                  <div
                    key={member.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-slate-200 hover:border-slate-300'
                    } ${isOwner ? 'cursor-not-allowed' : ''}`}
                    onClick={() => !isOwner && toggleMember(member.id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={isOwner}
                      className="pointer-events-none"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {getRoleIcon(member.role)}
                        <span className="font-medium truncate">{displayName}</span>
                        {getRoleBadge(member.role)}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {member.user.username}
                      </p>
                      {member.lastActivityAt && (
                        <p className="text-xs text-muted-foreground">
                          Active {formatDistanceToNow(new Date(member.lastActivityAt), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                    {isOwner && (
                      <span className="text-xs text-muted-foreground">
                        Always keeps seat
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {membersToLoseSeat.length > 0 && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800">
                    {membersToLoseSeat.length} member{membersToLoseSeat.length !== 1 ? 's' : ''} will lose access
                  </p>
                  <p className="text-amber-700 text-xs mt-1">
                    They will be notified via email and can be re-added later.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || selectedIds.size !== targetSeats}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirm Selection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SeatSelectionModal;
