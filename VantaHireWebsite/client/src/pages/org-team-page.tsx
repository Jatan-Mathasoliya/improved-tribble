import { useState } from "react";
import {
  useOrganization,
  useOrganizationMembers,
  useOrganizationInvites,
  useJoinRequests,
  useInviteMember,
  useRemoveMember,
  useRespondToJoinRequest,
  useMemberJobs,
  useReassignJobs,
  type OrganizationMember,
  type OrganizationInvite,
  type JoinRequest,
} from "@/hooks/use-organization";
import { useSeatUsage, useReduceSeats } from "@/hooks/use-subscription";
import { SeatSelectionModal } from "@/components/org/seat-selection-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  UserPlus,
  Mail,
  Clock,
  Check,
  X,
  Trash2,
  Crown,
  Shield,
  User,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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
      return <Badge variant="default" className="bg-amber-500">Owner</Badge>;
    case 'admin':
      return <Badge variant="default" className="bg-blue-500">Admin</Badge>;
    default:
      return <Badge variant="secondary">Member</Badge>;
  }
}

export default function OrgTeamPage() {
  const { data: orgData } = useOrganization();
  const { data: members, isLoading: membersLoading } = useOrganizationMembers();
  const { data: invites } = useOrganizationInvites();
  const { data: joinRequests } = useJoinRequests();
  const { data: seatUsage } = useSeatUsage();
  const inviteMember = useInviteMember();
  const removeMember = useRemoveMember();
  const respondToJoinRequest = useRespondToJoinRequest();
  const reduceSeats = useReduceSeats();
  const reassignJobs = useReassignJobs();
  const { toast } = useToast();

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');

  // Seat reduction modal state
  const [seatReductionOpen, setSeatReductionOpen] = useState(false);
  const [targetSeats, setTargetSeats] = useState(1);

  // Member removal with reassignment state
  const [memberToRemove, setMemberToRemove] = useState<OrganizationMember | null>(null);
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [reassignToUserId, setReassignToUserId] = useState<number | null>(null);

  // Fetch jobs for member being removed
  const { data: memberJobs } = useMemberJobs(memberToRemove?.id ?? null);

  const isOwnerOrAdmin = orgData?.membership?.role === 'owner' || orgData?.membership?.role === 'admin';

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    try {
      await inviteMember.mutateAsync({ email: inviteEmail.trim(), role: inviteRole });
      toast({
        title: "Invitation sent",
        description: `Invitation sent to ${inviteEmail}`,
      });
      setInviteEmail("");
      setInviteRole('member');
      setInviteDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    }
  };

  // Handle seat reduction confirmation
  const handleSeatReductionConfirm = async (selectedMemberIds: number[]) => {
    try {
      await reduceSeats.mutateAsync({
        newSeatCount: targetSeats,
        memberIdsToKeep: selectedMemberIds,
      });
      toast({
        title: "Seats reduced",
        description: `Successfully reduced to ${targetSeats} seat${targetSeats !== 1 ? 's' : ''}.`,
      });
      setSeatReductionOpen(false);
    } catch (error: any) {
      throw error; // Let the modal handle the error
    }
  };

  // Open manage seats modal
  const openManageSeats = (newSeatCount: number) => {
    setTargetSeats(newSeatCount);
    setSeatReductionOpen(true);
  };

  const handleRemoveMember = async (member: OrganizationMember) => {
    if (member.role === 'owner') {
      toast({
        title: "Cannot remove owner",
        description: "The organization owner cannot be removed.",
        variant: "destructive",
      });
      return;
    }

    // Set member to remove and open reassign dialog to check for jobs
    setMemberToRemove(member);
    setReassignDialogOpen(true);
  };

  // Actually remove the member (after reassignment prompt)
  const confirmRemoveMember = async () => {
    if (!memberToRemove) return;

    try {
      // If there are jobs and reassignToUserId is set, reassign first
      if (memberJobs && memberJobs.length > 0 && reassignToUserId) {
        await reassignJobs.mutateAsync({
          fromMemberId: memberToRemove.id,
          toUserId: reassignToUserId,
        });
      }

      await removeMember.mutateAsync(memberToRemove.id);
      toast({
        title: "Member removed",
        description: `${memberToRemove.user.firstName || memberToRemove.user.username} has been removed.`,
      });
      setReassignDialogOpen(false);
      setMemberToRemove(null);
      setReassignToUserId(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove member",
        variant: "destructive",
      });
    }
  };

  const handleJoinRequestResponse = async (request: JoinRequest, status: 'approved' | 'rejected') => {
    try {
      await respondToJoinRequest.mutateAsync({ requestId: request.id, status });
      toast({
        title: status === 'approved' ? "Request approved" : "Request rejected",
        description: `${request.user.firstName || request.user.username}'s request has been ${status}.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to respond to request",
        variant: "destructive",
      });
    }
  };

  const pendingJoinRequests = joinRequests?.filter(r => r.status === 'pending') || [];

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team Members</h1>
          <p className="text-muted-foreground">
            Manage your organization's team members
          </p>
        </div>
        {isOwnerOrAdmin && (
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleInvite}>
                <DialogHeader>
                  <DialogTitle>Invite Team Member</DialogTitle>
                  <DialogDescription>
                    Send an invitation to join your organization.
                    {seatUsage && seatUsage.available <= 0 && (
                      <span className="text-amber-600 block mt-2">
                        No seats available. Purchase more seats first.
                      </span>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select value={inviteRole} onValueChange={(v: 'admin' | 'member') => setInviteRole(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={inviteMember.isPending || !inviteEmail.trim() || (seatUsage?.available || 0) <= 0}
                  >
                    {inviteMember.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Send Invitation
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Seat Usage */}
      {seatUsage && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Seat Usage</p>
                  <p className="text-sm text-muted-foreground">
                    {seatUsage.assigned} of {seatUsage.purchased} seats used
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={seatUsage.available > 0 ? "default" : "destructive"}>
                  {seatUsage.available} available
                </Badge>
                {isOwnerOrAdmin && seatUsage.purchased > 1 && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        Manage Seats
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Manage Seats</DialogTitle>
                        <DialogDescription>
                          Reduce the number of seats for your organization. You currently have {seatUsage.purchased} seats with {seatUsage.assigned} in use.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="py-4 space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="newSeats">New seat count</Label>
                          <Select
                            value={targetSeats.toString()}
                            onValueChange={(v) => setTargetSeats(parseInt(v))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: seatUsage.purchased }, (_, i) => i + 1).map((num) => (
                                <SelectItem key={num} value={num.toString()}>
                                  {num} seat{num !== 1 ? 's' : ''}
                                  {num < seatUsage.assigned && ` (${seatUsage.assigned - num} will lose access)`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={() => {
                            if (targetSeats < seatUsage.assigned) {
                              // Need to select which members keep seats
                              setSeatReductionOpen(true);
                            } else {
                              // Just reduce seats, no one loses access
                              handleSeatReductionConfirm(
                                members?.map(m => m.id) || []
                              );
                            }
                          }}
                          disabled={targetSeats === seatUsage.purchased}
                        >
                          {targetSeats < seatUsage.assigned ? "Select Members" : "Reduce Seats"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Join Requests */}
      {pendingJoinRequests.length > 0 && isOwnerOrAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Pending Join Requests
            </CardTitle>
            <CardDescription>
              Users requesting to join your organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingJoinRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">
                      {request.user.firstName} {request.user.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {request.user.username}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleJoinRequestResponse(request, 'rejected')}
                      disabled={respondToJoinRequest.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleJoinRequestResponse(request, 'approved')}
                      disabled={respondToJoinRequest.isPending || (seatUsage?.available || 0) <= 0}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  {isOwnerOrAdmin && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members?.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          {getRoleIcon(member.role)}
                        </div>
                        <div>
                          <p className="font-medium">
                            {member.user.firstName} {member.user.lastName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {member.user.username}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getRoleBadge(member.role)}</TableCell>
                    <TableCell>
                      {member.seatAssigned ? (
                        <Badge variant="outline" className="text-green-600 border-green-200">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-200">
                          No Seat
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistanceToNow(new Date(member.joinedAt), { addSuffix: true })}
                    </TableCell>
                    {isOwnerOrAdmin && (
                      <TableCell>
                        {member.role !== 'owner' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveMember(member)}
                            disabled={removeMember.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pending Invites */}
      {invites && invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Pending Invitations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{invite.email}</p>
                    <p className="text-sm text-muted-foreground">
                      Expires {formatDistanceToNow(new Date(invite.expiresAt), { addSuffix: true })}
                    </p>
                  </div>
                  <Badge variant="secondary">{invite.role}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Seat Selection Modal for reduction */}
      {members && (
        <SeatSelectionModal
          open={seatReductionOpen}
          onOpenChange={setSeatReductionOpen}
          members={members.map(m => ({
            id: m.id,
            userId: m.userId,
            role: m.role,
            seatAssigned: m.seatAssigned,
            lastActivityAt: m.lastActivityAt || null,
            user: {
              firstName: m.user.firstName || null,
              lastName: m.user.lastName || null,
              username: m.user.username,
            },
          }))}
          targetSeats={targetSeats}
          onConfirm={handleSeatReductionConfirm}
          title={`Select ${targetSeats} Member${targetSeats !== 1 ? 's' : ''} to Keep`}
          description={`You are reducing to ${targetSeats} seat${targetSeats !== 1 ? 's' : ''}. Select which members should keep access.`}
        />
      )}

      {/* Reassignment Dialog for member removal */}
      <Dialog open={reassignDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setMemberToRemove(null);
          setReassignToUserId(null);
        }
        setReassignDialogOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              {memberToRemove && (
                <>
                  You are removing {memberToRemove.user.firstName || memberToRemove.user.username} from the organization.
                  {memberJobs && memberJobs.length > 0 && (
                    <span className="block mt-2 text-amber-600">
                      This member has {memberJobs.length} job{memberJobs.length !== 1 ? 's' : ''}. Would you like to reassign them?
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {memberJobs && memberJobs.length > 0 && members && (
            <div className="py-4">
              <Label htmlFor="reassignTo">Reassign jobs to</Label>
              <Select
                value={reassignToUserId?.toString() || "none"}
                onValueChange={(v) => setReassignToUserId(v === "none" ? null : parseInt(v))}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select a member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Don't reassign (jobs will be orphaned)</SelectItem>
                  {members
                    .filter(m => m.id !== memberToRemove?.id && m.seatAssigned)
                    .map((m) => (
                      <SelectItem key={m.userId} value={m.userId.toString()}>
                        {m.user.firstName || m.user.username}
                        {m.role === 'owner' && ' (Owner)'}
                        {m.role === 'admin' && ' (Admin)'}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRemoveMember}
              disabled={removeMember.isPending || reassignJobs.isPending}
            >
              {(removeMember.isPending || reassignJobs.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Remove Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
