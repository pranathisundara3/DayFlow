
'use client';

import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dumbbell, Save, Download, Upload, BellDot, Palette } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

function BackupAndRestore() {
    const { user } = useAuth();
    const { toast } = useToast();

    const handleBackup = async () => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to back up data.' });
            return;
        }
        try {
            const dataCollections = ['budget', 'habits', 'notes', 'notifications', 'passwords', 'todos', 'transactions', 'weeklySchedule', 'ai_chats', 'settings', 'gym_protein_intakes', 'gym_logged_foods', 'gym_protein_target', 'gym_custom_foods', 'gym_workout_split', 'gym_cycle_config'];
            const backupData: Record<string, any> = {};
            
            for (const coll of dataCollections) {
                const docRef = doc(db, 'users', user.uid, 'data', coll);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    backupData[coll] = docSnap.data();
                }
            }
            
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if(userDocSnap.exists()) {
                backupData['userProfile'] = userDocSnap.data();
            }

            const json = JSON.stringify(backupData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `DayFlow_backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast({ title: 'Success', description: 'Your data has been downloaded.' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Backup Failed', description: 'Could not back up your data.' });
        }
    };

    const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to restore data.' });
            return;
        }
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = e.target?.result as string;
                const backupData = JSON.parse(json);

                for (const [coll, data] of Object.entries(backupData)) {
                    if (coll === 'userProfile') {
                         await setDoc(doc(db, 'users', user.uid), data as any, { merge: true });
                    } else {
                         await setDoc(doc(db, 'users', user.uid, 'data', coll), data as any);
                    }
                }
                toast({ title: 'Success', description: 'Your data has been restored. The page will now reload.' });
                setTimeout(() => window.location.reload(), 2000);
            } catch (error) {
                console.error(error);
                toast({ variant: 'destructive', title: 'Restore Failed', description: 'The backup file is invalid or corrupt.' });
            }
        };
        reader.readAsText(file);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Backup &amp; Restore</CardTitle>
                <CardDescription>Download all your data to a file or restore from a previous backup.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-4">
                <Button onClick={handleBackup} className="w-full sm:w-auto"><Download className="mr-2 h-4 w-4" />Download Backup</Button>
                <div className="relative w-full sm:w-auto">
                    <Button className="w-full pointer-events-none"><Upload className="mr-2 h-4 w-4" />Restore from Backup</Button>
                    <Input type="file" accept=".json" onChange={handleRestore} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
            </CardContent>
        </Card>
    );
}

function PushNotificationManager() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
            setIsSupported(true);
            setPermission(Notification.permission);
        } else {
            setIsSupported(false);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        const checkSubscription = async () => {
            if (isSupported && Notification.permission === 'granted') {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();
                setIsSubscribed(!!subscription);
            }
        };
        if(isSupported) {
            checkSubscription();
        }
    }, [isSupported, permission]);
    
    const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    };

    const subscribeUser = async () => {
        if (!user || !isSupported) return;
        
        if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
            toast({ variant: 'destructive', title: 'Configuration Error', description: 'VAPID public key is not configured in the environment.' });
            return;
        }
        
        setIsLoading(true);
        try {
            const registration = await navigator.serviceWorker.ready;
            const applicationServerKey = urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey,
            });
            const token = await user.getIdToken();
            await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(subscription),
            });
            setIsSubscribed(true);
            toast({ title: 'Subscribed!', description: 'You will now receive push notifications.' });
        } catch (error) {
            console.error('Failed to subscribe:', error);
            setPermission('default'); // Reset to allow retrying
            let description = 'Could not enable push notifications. Please try again.';
            if (error instanceof DOMException) {
                if (error.name === 'NotAllowedError') {
                    description = 'Notification permission was denied. Please enable it in your browser settings and try again.';
                } else {
                    description = 'Subscription failed. This is often due to an invalid VAPID key. Please verify your keys in the .env file and in your hosting provider settings.';
                }
            }
            toast({ variant: 'destructive', title: 'Subscription Failed', description });
        } finally {
            setIsLoading(false);
        }
    };
    
    const unsubscribeUser = async () => {
        if (!user || !isSupported) return;
        setIsLoading(true);
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
                const token = await user.getIdToken();
                await fetch('/api/push/unsubscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ endpoint: subscription.endpoint }),
                });
            }
            setIsSubscribed(false);
            toast({ title: 'Unsubscribed', description: 'Push notifications have been disabled.' });
        } catch (error) {
            console.error('Failed to unsubscribe:', error);
            toast({ variant: 'destructive', title: 'Failed to Unsubscribe', description: 'Could not disable push notifications.' });
        } finally {
            setIsLoading(false);
        }
    }
    
    const handleToggleSubscription = async () => {
        if (isSubscribed) {
            await unsubscribeUser();
            return;
        }

        if (permission === 'granted') {
            await subscribeUser();
        } else if (permission === 'default') {
            const newPermission = await Notification.requestPermission();
            setPermission(newPermission);
            if (newPermission === 'granted') {
                await subscribeUser();
            } else {
                toast({ variant: 'destructive', title: 'Permission Required', description: 'You need to grant permission to enable notifications.' });
            }
        } else { // 'denied'
            toast({ variant: 'destructive', title: 'Permission Denied', description: 'Please enable notifications for this site in your browser settings.' });
        }
    };

    const handleSendTest = async () => {
        if (!user) return;
        toast({ title: 'Sending...', description: 'Sending a test notification to your device.' });
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/push/send-test', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if(!res.ok) throw new Error("Failed to send test notification");
            toast({ title: 'Test Sent!', description: 'Check your device for a notification.' });
        } catch(e) {
             toast({ variant: 'destructive', title: 'Failed to Send', description: 'Could not send test notification.' });
        }
    }

    if (!isSupported) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><BellDot />Push Notifications</CardTitle>
                </CardHeader>
                <CardContent><p className="text-sm text-destructive">Your browser does not support push notifications.</p></CardContent>
            </Card>
        );
    }
    
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><BellDot />Push Notifications</CardTitle>
                <CardDescription>Receive reminders on supported desktop and mobile browsers, even when the app is closed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                        <Label htmlFor="push-switch" className="text-base">Enable Notifications</Label>
                        <p className="text-sm text-muted-foreground">
                            {permission === 'denied' && "You have blocked notifications."}
                            {permission === 'granted' && isSubscribed && "Notifications are enabled on this device."}
                            {permission === 'granted' && !isSubscribed && "Click to finalize subscription."}
                            {permission === 'default' && "Allow notifications to stay updated."}
                        </p>
                    </div>
                    <Switch id="push-switch" checked={isSubscribed} onCheckedChange={handleToggleSubscription} disabled={isLoading || permission === 'denied'} />
                </div>
                {permission === 'denied' && (
                    <p className="text-xs text-destructive px-1">You must enable notification permissions in your browser or system settings to use this feature.</p>
                )}
            </CardContent>
            {isSubscribed && (
                <CardFooter>
                    <Button onClick={handleSendTest} variant="secondary">Send Test Notification</Button>
                </CardFooter>
            )}
        </Card>
    )
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState({ gymTracking: true, theme: 'default-green' });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
        setIsLoading(false);
        return;
    };
    setIsLoading(true);
    const settingsDocRef = doc(db, 'users', user.uid, 'data', 'settings');
    const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const settingsData = (docSnap.data() as {items: any}).items;
            setSettings({
                gymTracking: settingsData.gymTracking !== false,
                theme: settingsData.theme || 'default-green',
            });
        } else {
            // If settings don't exist, create them
            const defaultSettings = { gymTracking: true, theme: 'default-green' };
            setDoc(settingsDocRef, { items: defaultSettings });
            setSettings(defaultSettings);
        }
        setIsLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const handleSettingChange = async (key: string, value: any) => {
    if (!user) return;
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    const settingsDocRef = doc(db, 'users', user.uid, 'data', 'settings');
    await setDoc(settingsDocRef, { items: newSettings });
  };

  return (
    <AppLayout>
        <div className="space-y-6">
            <header>
              <h1 className="text-2xl font-bold font-headline">Settings</h1>
              <p className="text-muted-foreground">Manage your application settings here.</p>
            </header>
            
            <Card>
                <CardHeader><CardTitle>Appearance</CardTitle><CardDescription>Customize the look and feel of the app.</CardDescription></CardHeader>
                <CardContent>
                    {isLoading ? ( <Skeleton className="h-10 w-full" /> ) : (
                        <div className="flex items-center justify-between rounded-lg border p-4">
                             <div className="space-y-0.5">
                                <Label className="text-base flex items-center gap-2"><Palette className="h-5 w-5" />App Theme</Label>
                                <p className="text-sm text-muted-foreground">Select a visual theme for the application.</p>
                            </div>
                            <Select value={settings.theme} onValueChange={(value) => handleSettingChange('theme', value)}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select theme" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default-green">Default Green</SelectItem>
                                    <SelectItem value="indigo">Soft Indigo</SelectItem>
                                    <SelectItem value="charcoal-yellow">Charcoal &amp; Yellow</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Feature Management</CardTitle><CardDescription>Enable or disable optional features to customize your experience.</CardDescription></CardHeader>
                <CardContent>
                    {isLoading ? ( <Skeleton className="h-20 w-full" /> ) : (
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="gym-tracking-switch" className="text-base flex items-center gap-2"><Dumbbell className="h-5 w-5" />Gym &amp; Fitness Tracking</Label>
                                <p className="text-sm text-muted-foreground">Show trackers for workouts, protein, and overload.</p>
                            </div>
                            <Switch id="gym-tracking-switch" checked={settings.gymTracking} onCheckedChange={(checked) => handleSettingChange('gymTracking', checked)} />
                        </div>
                    )}
                </CardContent>
            </Card>
            
            <PushNotificationManager />

            <BackupAndRestore />
            
      </div>
    </AppLayout>
  );
}
