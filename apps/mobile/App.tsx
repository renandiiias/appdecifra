import 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import SearchScreen from './src/screens/SearchScreen';
import SongsScreen from './src/screens/SongsScreen';
import ArtistsScreen from './src/screens/ArtistsScreen';
import ArtistDetailScreen from './src/screens/ArtistDetailScreen';
import SongScreen from './src/screens/SongScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import FavoritesFolderScreen from './src/screens/FavoritesFolderScreen';
import TunerScreen from './src/screens/TunerScreen';
import LoginScreen from './src/screens/LoginScreen';
import MaintenanceScreen from './src/screens/MaintenanceScreen';
import { colors } from './src/lib/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabButton({ children, accessibilityState, style, ...props }: any) {
  const selected = Boolean(accessibilityState?.selected);
  return (
    <Pressable {...props} style={[style, styles.tabButton]}>
      <View style={[styles.tabIndicator, selected ? styles.tabIndicatorActive : null]} />
      {children}
    </Pressable>
  );
}

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, headerBackTitleVisible: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="Songs" component={SongsScreen} />
      <Stack.Screen name="Artists" component={ArtistsScreen} />
      <Stack.Screen name="ArtistDetail" component={ArtistDetailScreen} />
      <Stack.Screen name="Song" component={SongScreen} />
      <Stack.Screen name="Maintenance" component={MaintenanceScreen} />
    </Stack.Navigator>
  );
}

function SearchStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, headerBackTitleVisible: false }}>
      <Stack.Screen name="Search" component={SearchScreen} initialParams={{ tabRoot: true }} />
      <Stack.Screen name="Song" component={SongScreen} />
      <Stack.Screen name="Maintenance" component={MaintenanceScreen} />
    </Stack.Navigator>
  );
}

function FavoritesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, headerBackTitleVisible: false }}>
      <Stack.Screen name="Favorites" component={FavoritesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="FavoritesFolder" component={FavoritesFolderScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Song" component={SongScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Maintenance" component={MaintenanceScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function RootNavigator() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 14);
  const baseTabBarStyle = {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 62 + bottomPad,
    paddingBottom: bottomPad,
    paddingTop: 8
  } as const;

  const tabBarStyleForRoute = (route: any) => {
    const focused = getFocusedRouteNameFromRoute(route) ?? 'Home';
    if (focused === 'Song') return { display: 'none' } as const;
    return baseTabBarStyle;
  };

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: colors.background,
      card: colors.card,
      primary: colors.accent,
      text: colors.text,
      border: colors.border
    }
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarIconStyle: { marginTop: 2 },
          tabBarButton: (props) => <TabButton {...props} />,
          tabBarStyle: baseTabBarStyle,
          tabBarHideOnKeyboard: true
        }}
      >
        <Tab.Screen
          name="Inicio"
          component={HomeStack}
          options={({ route }) => ({
            headerShown: false,
            tabBarLabel: 'Início',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={size ?? 24} color={color} />
            ),
            tabBarStyle: tabBarStyleForRoute(route)
          })}
        />
        <Tab.Screen
          name="Favoritos"
          component={FavoritesStack}
          options={({ route }) => ({
            headerShown: false,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'heart' : 'heart-outline'} size={size ?? 24} color={color} />
            ),
            tabBarStyle: tabBarStyleForRoute(route)
          })}
        />
        <Tab.Screen
          name="Busca"
          component={SearchStack}
          options={({ route }) => ({
            headerShown: false,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'search' : 'search-outline'} size={size ?? 24} color={color} />
            ),
            tabBarStyle: tabBarStyleForRoute(route)
          })}
        />
        <Tab.Screen
          name="Afinador"
          component={TunerScreen}
          options={{
            headerShown: false,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? 'musical-notes' : 'musical-notes-outline'}
                size={size ?? 24}
                color={color}
              />
            )
          }}
        />
        <Tab.Screen
          name="Conta"
          component={LoginScreen}
          options={{
            headerShown: false,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? 'person-circle' : 'person-circle-outline'}
                size={size ?? 24}
                color={color}
              />
            )
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <RootNavigator />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12
  },
  tabIndicator: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'transparent'
  },
  tabIndicatorActive: {
    backgroundColor: colors.accent
  }
});
