angular
    .module('arraysApp')
    .controller('AdminCtrl', ['$scope', '$state', 'AuthService', '$window', '$location', '$mdSidenav', '$state',
        function ($scope, $state, AuthService, $window, $location, $mdSidenav, $state) {

            $scope.currentMenuItem = '';

            $scope.$on('$stateChangeStart',
            function(event, toState, toParams, fromState, fromParams){
                $scope.closeLeft();
            })

            $scope.$on('$stateChangeSuccess',
            function(event, toState, toParams, fromState, fromParams){
                // workaround for ui-sref-active bug
                $scope.currentMenuItem = $scope.$state.current.name.split('.')[1];
            })

            $scope.user = AuthService.currentUser();
            $scope.teams = AuthService.allTeams();

            $scope.updateSubdomain = function() {
                $scope.team = AuthService.currentTeam();
                $scope.subdomain = $location.protocol() +  "://" + $scope.team.subdomain  + "."+ $location.host() + ":" + $location.port();
            }

            $scope.updateSubdomain();

            $scope.explore_url = $location.protocol() +  "://explore." +  $location.host() + ":" + $location.port();

            $scope.logout = function() {
                AuthService.logout();
            };

            $scope.closeLeft = buildCloser('left');
            $scope.toggleLeft = buildToggler('left');

            function buildCloser(navID) {
                return function() {
                    $mdSidenav(navID).close()
                }
            }
            function buildToggler(navID) {
                return function() {
                    $mdSidenav(navID).toggle()
                }
            }

    }]);
